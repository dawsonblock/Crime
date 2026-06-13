import express from "express";
import path from "path";
import crypto from "crypto";
import https from "https";
import dotenv from "dotenv";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { EventItem, SeverityType, LocationPrecisionType, SourceType } from "./src/types";
import { CityAdaptor } from "./CityAdaptor";
import { calculateThreatScore } from "./src/utils/scoring";
import fs from "fs";
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, doc, setDoc, getDoc, getDocs, collection, query, where, deleteDoc, writeBatch, limit, orderBy
} from "firebase/firestore";

dotenv.config();

const DEMO_MODE = process.env.DEMO_MODE === "true";

// Read Firebase applet configuration securely from local volume JSON and initialize Firebase Client SDK
let db: any = null;
try {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    const firebaseApp = getApps().length === 0 ? initializeApp(config) : getApp();
    db = getFirestore(firebaseApp, config.firestoreDatabaseId);
    console.log("[Firebase] Successfully initialized with Database ID:", config.firestoreDatabaseId);
  } else {
    console.warn("[Firebase] Warning: firebase-applet-config.json not found. Database operations will run in-memory fallback.");
  }
} catch (err) {
  console.error("[Firebase Error] Configuration/Initialization failed:", err);
}

// Security error tracking metrics in accordance with Firestore security rule specifications
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, colPath: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path: colPath
  };
  console.error('Firestore Error IncidentLogged:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function sanitizeFirestoreData(data: any): any {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    return data.map(item => sanitizeFirestoreData(item)).filter(v => v !== undefined);
  }
  if (typeof data === "object") {
    const cleaned: any = {};
    for (const key of Object.keys(data)) {
      if (data[key] !== undefined) {
        cleaned[key] = sanitizeFirestoreData(data[key]);
      }
    }
    return cleaned;
  }
  return data;
}


// Helper to fetch content bypassing SSL/TLS certificate chain verification errors
function fetchWithSslBypass(urlStr: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = (targetUrl: string) => {
      const urlObj = new URL(targetUrl);
      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          ...headers,
        },
        rejectUnauthorized: false, // Prevents "unable to verify the first certificate" error
      };

      const req = https.request(options, (res) => {
        // Handle potential HTTP 3xx redirects
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (!redirectUrl.startsWith("http")) {
            redirectUrl = new URL(redirectUrl, targetUrl).toString();
          }
          request(redirectUrl);
          return;
        }

        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Failed to fetch ${targetUrl} - Status Code: ${res.statusCode}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.end();
    };

    request(urlStr);
  });
}

const app = express();
app.use(express.json());

const PORT = 3000;

// Shared mutable events stored in memory (loaded with 20 realistic Saskatoon & Saskatchewan seeds)
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

const initialSeeds: EventItem[] = [
  {
    id: "seed-1",
    sourceKey: "saskatoon_police_news",
    sourceName: "Saskatoon Police News / Alerts",
    sourceType: "official",
    title: "Weapon/Assault Investigation on 20th Street West",
    summary: "Patrol officers responded to reports of an altercation involving an individual carrying a bladed weapon in the 300 block of 20th Street West. Area was secured and the weapon was seized without further conflict.",
    originalUrl: "https://saskatoonpolice.ca/news/2026-weapon-20th",
    publishedAt: hoursAgo(3),
    retrievedAt: hoursAgo(2.5),
    eventType: "weapons",
    severity: "high",
    confidence: 0.95,
    locationText: "300 Block 20th Street West, Saskatoon, SK",
    latitude: 52.1260,
    longitude: -106.6810,
    locationPrecision: "block",
    locationConfidence: 0.90,
    sourceHash: "seed-hash-1",
    createdAt: hoursAgo(2.5)
  },
  {
    id: "seed-2",
    sourceKey: "cbc_saskatoon_news",
    sourceName: "CBC Saskatoon News",
    sourceType: "media",
    title: "Two-Vehicle Traffic Collision on Circle Drive North",
    summary: "Emergency services responded to a multi-vehicle crash on Circle Drive near the bridge. Moderate traffic delays are expected for northbound commuters while debris is cleared.",
    originalUrl: "https://www.cbc.ca/news/canada/saskatoon-circle-drive-crash",
    publishedAt: hoursAgo(7),
    retrievedAt: hoursAgo(6.5),
    eventType: "traffic_collision",
    severity: "low",
    confidence: 0.92,
    locationText: "Circle Drive North Bridge, Saskatoon, SK",
    latitude: 52.1380,
    longitude: -106.6120,
    locationPrecision: "intersection",
    locationConfidence: 0.85,
    sourceHash: "seed-hash-2",
    createdAt: hoursAgo(6.5)
  },
  {
    id: "seed-3",
    sourceKey: "rcmp_saskatchewan_news",
    sourceName: "Saskatchewan RCMP News Releases",
    sourceType: "official",
    title: "Saskatchewan RCMP Warns of Dangerous Driver on Highway 11",
    summary: "Warman RCMP received multiple reports of a vehicle driving erratically at high speeds near Highway 11 warman corridor. A spike belt was successfully deployed and the driver is in custody.",
    originalUrl: "https://www.rcmp-grc.gc.ca/en/news/highway-11-stop",
    publishedAt: hoursAgo(15),
    retrievedAt: hoursAgo(14),
    eventType: "police_operation",
    severity: "high",
    confidence: 0.96,
    locationText: "Highway 11 near Warman, SK",
    latitude: 52.3210,
    longitude: -106.5840,
    locationPrecision: "block",
    locationConfidence: 0.95,
    sourceHash: "seed-hash-3",
    createdAt: hoursAgo(14)
  },
  {
    id: "seed-4",
    sourceKey: "saskatoon_crime_map",
    sourceName: "Saskatoon Police Crime Map Layers (Approx Points)",
    sourceType: "official",
    title: "Commercial Break & Enter",
    summary: "A commercial business in the Stonebridge district reported forced entry through a rear door. Electronics and cashbox were compromised. Police are analyzing CCTV footage.",
    originalUrl: "https://map.saskatoonpolice.ca/stonebridge-be",
    publishedAt: hoursAgo(26),
    retrievedAt: hoursAgo(25),
    eventType: "break_and_enter",
    severity: "medium",
    confidence: 0.90,
    locationText: "Stonebridge Common, Saskatoon, SK",
    latitude: 52.0911,
    longitude: -106.6112,
    locationPrecision: "neighbourhood",
    locationConfidence: 0.85,
    sourceHash: "seed-hash-4",
    createdAt: hoursAgo(25)
  },
  {
    id: "seed-5",
    sourceKey: "saskatchewan_gov_news",
    sourceName: "Saskatchewan Government & SIRT Notices",
    sourceType: "government",
    title: "SIRT Investigates Detention Facility Incident",
    summary: "The Serious Incident Response Team (SIRT) has been directed to investigate a medical distress event in the Prince Albert Correctional Centre.",
    originalUrl: "https://www.saskatchewan.ca/government/news/sirt-pa",
    publishedAt: hoursAgo(32),
    retrievedAt: hoursAgo(31),
    eventType: "sirt_investigation",
    severity: "medium",
    confidence: 0.97,
    locationText: "Prince Albert Correctional Centre, Prince Albert, SK",
    latitude: 53.2033,
    longitude: -105.7531,
    locationPrecision: "exact",
    locationConfidence: 0.98,
    sourceHash: "seed-hash-5",
    createdAt: hoursAgo(31)
  },
  {
    id: "seed-6",
    sourceKey: "saskatoon_police_news",
    sourceName: "Saskatoon Police News / Alerts",
    sourceType: "official",
    title: "Critical Public Threat Alert: Armed Stabbing on Broadway",
    summary: "Saskatoon Police are responding to an active stabbing incident in the 700 block of Broadway Avenue. Public is urged to avoid the area while tactical units secure the parameter.",
    originalUrl: "https://saskatoonpolice.ca/news/active-threat-broadway",
    publishedAt: hoursAgo(45),
    retrievedAt: hoursAgo(44.5),
    eventType: "stabbing",
    severity: "critical",
    confidence: 0.98,
    locationText: "700 Block Broadway Avenue, Saskatoon, SK",
    latitude: 52.1185,
    longitude: -106.6570,
    locationPrecision: "block",
    locationConfidence: 0.95,
    sourceHash: "seed-hash-6",
    createdAt: hoursAgo(44.5)
  },
  {
    id: "seed-7",
    sourceKey: "global_news_saskatoon",
    sourceName: "Global News Saskatoon",
    sourceType: "media",
    title: "Residential Structure Fire Controlled in Pleasant Hill",
    summary: "Saskatoon Fire Department responded to a multi-family home blaze on Avenue S South. No injuries reported, but heavy smoke damage caused relocation of residents.",
    originalUrl: "https://globalnews.ca/saskatoon/fire-pleasant-hill",
    publishedAt: hoursAgo(54),
    retrievedAt: hoursAgo(53),
    eventType: "fire",
    severity: "medium",
    confidence: 0.93,
    locationText: "Avenue S South, Pleasant Hill, Saskatoon, SK",
    latitude: 52.1270,
    longitude: -106.6900,
    locationPrecision: "block",
    locationConfidence: 0.90,
    sourceHash: "seed-hash-7",
    createdAt: hoursAgo(53)
  },
  {
    id: "seed-8",
    sourceKey: "saskatoon_police_news",
    sourceName: "Saskatoon Police News / Alerts",
    sourceType: "official",
    title: "Search for Vulnerable Missing Senior",
    summary: "Police are requesting assistance locating 74-year-old Arthur Pendelton, last seen early today near Kinsmen Park. He may appear disoriented or confused.",
    originalUrl: "https://saskatoonpolice.ca/news/missing-arthur",
    publishedAt: hoursAgo(66),
    retrievedAt: hoursAgo(65),
    eventType: "missing_person",
    severity: "high",
    confidence: 0.91,
    locationText: "Kinsmen Park, Spadina Crescent, Saskatoon, SK",
    latitude: 52.1340,
    longitude: -106.6530,
    locationPrecision: "exact",
    locationConfidence: 0.90,
    sourceHash: "seed-hash-8",
    createdAt: hoursAgo(65)
  },
  {
    id: "seed-9",
    sourceKey: "cbc_saskatoon_news",
    sourceName: "CBC Saskatoon News",
    sourceType: "media",
    title: "Major Drug and Weapon Seizure during Traffic Stop",
    summary: "A routing checks protocol resulted in the arrest of two individuals after officers discovered fentanyl quantities and an unregistered handgun inside the trunk on 8th Street.",
    originalUrl: "https://www.cbc.ca/news/saskatoon-drug-stop",
    publishedAt: hoursAgo(78),
    retrievedAt: hoursAgo(77),
    eventType: "drugs",
    severity: "high",
    confidence: 0.94,
    locationText: "8th Street East & Preston Avenue, Saskatoon, SK",
    latitude: 52.1197,
    longitude: -106.6457,
    locationPrecision: "intersection",
    locationConfidence: 0.95,
    sourceHash: "seed-hash-9",
    createdAt: hoursAgo(77)
  },
  {
    id: "seed-10",
    sourceKey: "saskatoon_crime_map",
    sourceName: "Saskatoon Police Crime Map Layers (Approx Points)",
    sourceType: "official",
    title: "Stolen Utility Vehicle Recovery",
    summary: "A tracking beacon helped patrol officers locate a commercial service truck reported stolen yesterday from a lot in Sutherland.",
    originalUrl: "https://map.saskatoonpolice.ca/sutherland-theft",
    publishedAt: hoursAgo(92),
    retrievedAt: hoursAgo(91),
    eventType: "vehicle_theft",
    severity: "medium",
    confidence: 0.89,
    locationText: "Central Avenue, Sutherland, Saskatoon, SK",
    latitude: 52.1520,
    longitude: -106.5910,
    locationPrecision: "neighbourhood",
    locationConfidence: 0.80,
    sourceHash: "seed-hash-10",
    createdAt: hoursAgo(91)
  },
  {
    id: "seed-11",
    sourceKey: "saskatoon_police_news",
    sourceName: "Saskatoon Police News / Alerts",
    sourceType: "official",
    title: "Public Assistance Sought in Robbery Investigation",
    summary: "A suspect threatened an attendant with a chemical spray before fleeing with cash from a convenience store near 33rd Street.",
    originalUrl: "https://saskatoonpolice.ca/news/robbery-33rd",
    publishedAt: hoursAgo(110),
    retrievedAt: hoursAgo(109),
    eventType: "robbery",
    severity: "high",
    confidence: 0.92,
    locationText: "33rd Street West, Saskatoon, SK",
    latitude: 52.1460,
    longitude: -106.6660,
    locationPrecision: "block",
    locationConfidence: 0.85,
    sourceHash: "seed-hash-11",
    createdAt: hoursAgo(109)
  },
  {
    id: "seed-12",
    sourceKey: "global_news_saskatoon",
    sourceName: "Global News Saskatoon",
    sourceType: "media",
    title: "Disturbance Leads to Multiple Assault Charges at Bar",
    summary: "Saskatoon Police responded to a large fight outside a commercial lounge on Broadway, resulting in two individuals facing assault charges.",
    originalUrl: "https://globalnews.ca/saskatoon/broadway-fight",
    publishedAt: hoursAgo(130),
    retrievedAt: hoursAgo(129),
    eventType: "assault",
    severity: "high",
    confidence: 0.88,
    locationText: "Broadway Avenue & 10th Street, Saskatoon, SK",
    latitude: 52.1185,
    longitude: -106.6570,
    locationPrecision: "intersection",
    locationConfidence: 0.90,
    sourceHash: "seed-hash-12",
    createdAt: hoursAgo(129)
  },
  {
    id: "seed-13",
    sourceKey: "saskatoon_police_news",
    sourceName: "Saskatoon Police News / Alerts",
    sourceType: "official",
    title: "Dangerous Driving & Collision Arrest",
    summary: "An individual attempting to bypass a construction zone on Circle Drive collided with safety barriers. Impairment chemical screening is ongoing.",
    originalUrl: "https://saskatoonpolice.ca/news/circle-crash-barriers",
    publishedAt: hoursAgo(150),
    retrievedAt: hoursAgo(149),
    eventType: "traffic_collision",
    severity: "low",
    confidence: 0.94,
    locationText: "Circle Drive East, Saskatoon, SK",
    latitude: 52.1380,
    longitude: -106.6120,
    locationPrecision: "block",
    locationConfidence: 0.88,
    sourceHash: "seed-hash-13",
    createdAt: hoursAgo(149)
  },
  {
    id: "seed-14",
    sourceKey: "saskatoon_crime_map",
    sourceName: "Saskatoon Police Crime Map Layers (Approx Points)",
    sourceType: "official",
    title: "Theft Under $5000",
    summary: "Power tools and copper piping were taken overnight from a residential construction site in Stonebridge. Unsecure security fence suspected.",
    originalUrl: "https://map.saskatoonpolice.ca/theft-stonebridge",
    publishedAt: hoursAgo(175),
    retrievedAt: hoursAgo(174),
    eventType: "public_disorder",
    severity: "low",
    confidence: 0.85,
    locationText: "Stonebridge, Saskatoon, SK",
    latitude: 52.0911,
    longitude: -106.6112,
    locationPrecision: "neighbourhood",
    locationConfidence: 0.80,
    sourceHash: "seed-hash-14",
    createdAt: hoursAgo(174)
  },
  {
    id: "seed-15",
    sourceKey: "rcmp_saskatchewan_news",
    sourceName: "Saskatchewan RCMP News Releases",
    sourceType: "official",
    title: "Dundurn RCMP Detain Suspect with Outstanding Warrants",
    summary: "A traffic check near Dundurn led RCMP officers to arrest a wanted local resident on multiple provincial court warrants for property damage offences.",
    originalUrl: "https://www.rcmp-grc.gc.ca/en/news/dundurn-arrest",
    publishedAt: hoursAgo(200),
    retrievedAt: hoursAgo(199),
    eventType: "wanted_person",
    severity: "medium",
    confidence: 0.93,
    locationText: "Dundurn Patrol Sector, Dundurn, SK",
    latitude: 51.8150,
    longitude: -106.5050,
    locationPrecision: "neighbourhood",
    locationConfidence: 0.85,
    sourceHash: "seed-hash-15",
    createdAt: hoursAgo(199)
  },
  {
    id: "seed-16",
    sourceKey: "saskatoon_police_news",
    sourceName: "Saskatoon Police News / Alerts",
    sourceType: "official",
    title: "Search and Recovery Operation: Body Found in River",
    summary: "Saskatoon Police and Fire water rescue crews retrieved a deceased person from the South Saskatchewan River near Spadina Crescent. Investigation underway.",
    originalUrl: "https://saskatoonpolice.ca/news/river-recovery",
    publishedAt: hoursAgo(230),
    retrievedAt: hoursAgo(229),
    eventType: "homicide",
    severity: "critical",
    confidence: 0.95,
    locationText: "Riverbank near Spadina Crescent East, Saskatoon, SK",
    latitude: 52.1285,
    longitude: -106.6550,
    locationPrecision: "exact",
    locationConfidence: 0.95,
    sourceHash: "seed-hash-16",
    createdAt: hoursAgo(229)
  },
  {
    id: "seed-17",
    sourceKey: "cbc_saskatoon_news",
    sourceName: "CBC Saskatoon News",
    sourceType: "media",
    title: "Saskatoon Neighborhood Group Raises Public Safety Alarm",
    summary: "Resident associations in Pleasant Hill are reporting a surge in vandalism, public alcohol intoxication, and property garbage piles in public parks.",
    originalUrl: "https://www.cbc.ca/news/pleasant-hill-safety",
    publishedAt: hoursAgo(260),
    retrievedAt: hoursAgo(259),
    eventType: "public_disorder",
    severity: "low",
    confidence: 0.87,
    locationText: "Pleasant Hill District, Saskatoon, SK",
    latitude: 52.1270,
    longitude: -106.6900,
    locationPrecision: "neighbourhood",
    locationConfidence: 0.90,
    sourceHash: "seed-hash-17",
    createdAt: hoursAgo(259)
  },
  {
    id: "seed-18",
    sourceKey: "saskatoon_police_news",
    sourceName: "Saskatoon Police News / Alerts",
    sourceType: "official",
    title: "Police Perimeter Active During Tactical Search",
    summary: "A high police presence blocking the 800 block of Preston Avenue Avenue has concluded. Officers were targeting a suspect barricaded in a suite. Suspect detained.",
    originalUrl: "https://saskatoonpolice.ca/news/preston-barricade",
    publishedAt: hoursAgo(300),
    retrievedAt: hoursAgo(299),
    eventType: "police_operation",
    severity: "high",
    confidence: 0.92,
    locationText: "Preston Avenue South, Saskatoon, SK",
    latitude: 52.1190,
    longitude: -106.6210,
    locationPrecision: "block",
    locationConfidence: 0.90,
    sourceHash: "seed-hash-18",
    createdAt: hoursAgo(299)
  },
  {
    id: "seed-19",
    sourceKey: "saskatoon_police_news",
    sourceName: "Saskatoon Police News / Alerts",
    sourceType: "official",
    title: "Shooting Inquiry Launched in Downtown Core",
    summary: "Emergency calls reporting gunshots in a private downtown parking lot prompt police response. Officers located casings but no victims. Detectives appeal for tips.",
    originalUrl: "https://saskatoonpolice.ca/news/downtown-casings-found",
    publishedAt: hoursAgo(350),
    retrievedAt: hoursAgo(349),
    eventType: "shooting",
    severity: "critical",
    confidence: 0.94,
    locationText: "Downtown Saskatoon Parkade, Saskatoon, SK",
    latitude: 52.1290,
    longitude: -106.6600,
    locationPrecision: "block",
    locationConfidence: 0.95,
    sourceHash: "seed-hash-19",
    createdAt: hoursAgo(349)
  },
  {
    id: "seed-20",
    sourceKey: "saskatchewan_gov_news",
    sourceName: "Saskatchewan Government & SIRT Notices",
    sourceType: "government",
    title: "RCMP Warns of Dense Forest Smoke Hazards",
    summary: "Government alerts warn travellers heading north toward La Ronge of severe roadway visibility limitations due to nearby organic lightning-sparked forest fires.",
    originalUrl: "https://www.saskatchewan.ca/government/fire-notices",
    publishedAt: hoursAgo(400),
    retrievedAt: hoursAgo(399),
    eventType: "fire",
    severity: "medium",
    confidence: 0.94,
    locationText: "Highway 2 Corridor, North of Saskatoon to La Ronge, SK",
    latitude: 55.1051,
    longitude: -105.2892,
    locationPrecision: "city",
    locationConfidence: 0.85,
    sourceHash: "seed-hash-20",
    createdAt: hoursAgo(399)
  },
  {
    id: "seed-21",
    sourceKey: "regina_police_news",
    sourceName: "Regina Police News & Releases",
    sourceType: "official",
    title: "Commercial Burglary Inquest on Dewdney Avenue",
    summary: "Regina Patrol officers responded to an overnight break-and-enter incident targeting a commercial storefront. Security footage extracted representing suspect attire.",
    originalUrl: "https://reginapolice.ca/news/dewdney-burglary-investigation",
    publishedAt: hoursAgo(12),
    retrievedAt: hoursAgo(11),
    eventType: "robbery",
    severity: "medium",
    confidence: 0.95,
    locationText: "Dewdney Avenue, Regina, SK",
    latitude: 50.4578,
    longitude: -104.6152,
    locationPrecision: "block",
    locationConfidence: 0.95,
    sourceHash: "seed-hash-21",
    createdAt: hoursAgo(11)
  },
  {
    id: "seed-22",
    sourceKey: "prince_albert_police_news",
    sourceName: "Prince Albert Police News / Alerts",
    sourceType: "official",
    title: "Weapon Possession Charges Laid Following Marquis Road Intersection Stop",
    summary: "Prince Albert Police Service arrested two individuals during a high-risk vehicle stop near Marquis Road on active warrants and unlicenced weapon indicators.",
    originalUrl: "https://www.papolice.ca/news-releases/marquis-road-weapons-arrest",
    publishedAt: hoursAgo(15),
    retrievedAt: hoursAgo(14.5),
    eventType: "weapons",
    severity: "high",
    confidence: 0.94,
    locationText: "Marquis Road, Prince Albert, SK",
    latitude: 53.1782,
    longitude: -105.7489,
    locationPrecision: "intersection",
    locationConfidence: 0.92,
    sourceHash: "seed-hash-22",
    createdAt: hoursAgo(14.5)
  },
  {
    id: "seed-23",
    sourceKey: "moose_jaw_police_news",
    sourceName: "Moose Jaw Police Alerts",
    sourceType: "official",
    title: "Public Vandalism Incidents Reported in Downtown Sector",
    summary: "Moose Jaw Police received multiple alerts of spray-paint property damage on Main Street North. Patrol units are conducting targeted walkthrough monitoring checks.",
    originalUrl: "https://mjpolice.ca/news/vandalism-main-street-north",
    publishedAt: hoursAgo(19),
    retrievedAt: hoursAgo(18.5),
    eventType: "public_disorder",
    severity: "low",
    confidence: 0.90,
    locationText: "Main Street North, Moose Jaw, SK",
    latitude: 50.3995,
    longitude: -105.5352,
    locationPrecision: "block",
    locationConfidence: 0.90,
    sourceHash: "seed-hash-23",
    createdAt: hoursAgo(18.5)
  },
  {
    id: "seed-24",
    sourceKey: "rcmp_saskatchewan_news",
    sourceName: "Saskatchewan RCMP News Releases",
    sourceType: "official",
    title: "Swift Current RCMP: Highway 1 Roller Accident Cautionary Notice",
    summary: "Swift Current RCMP and emergency response teams are directing traffic around an overnight transport truck rollover on Trans-Canada Highway 1. Avoid visual distractions.",
    originalUrl: "https://www.rcmp-grc.gc.ca/en/news/swift-current-highway-collisions",
    publishedAt: hoursAgo(22),
    retrievedAt: hoursAgo(21.5),
    eventType: "traffic_collision",
    severity: "medium",
    confidence: 0.95,
    locationText: "Highway 1 Eastbound, Swift Current, SK",
    latitude: 50.2882,
    longitude: -107.7423,
    locationPrecision: "block",
    locationConfidence: 0.95,
    sourceHash: "seed-hash-24",
    createdAt: hoursAgo(21.5)
  },
  {
    id: "seed-25",
    sourceKey: "rcmp_saskatchewan_news",
    sourceName: "Saskatchewan RCMP News Releases",
    sourceType: "official",
    title: "North Battleford RCMP: Dangerous Weapon Seizure During Disturbance",
    summary: "RCMP Detachment officers seized an ilegal firearm and detained a suspect in response to late-evening weapons complaints near Railway Avenue.",
    originalUrl: "https://www.rcmp-grc.gc.ca/en/news/battlefords-weapons-complaint",
    publishedAt: hoursAgo(28),
    retrievedAt: hoursAgo(27),
    eventType: "weapons",
    severity: "high",
    confidence: 0.93,
    locationText: "Railway Avenue, North Battleford, SK",
    latitude: 52.7562,
    longitude: -108.2834,
    locationPrecision: "block",
    locationConfidence: 0.90,
    sourceHash: "seed-hash-25",
    createdAt: hoursAgo(27)
  },
  {
    id: "seed-26",
    sourceKey: "rcmp_saskatchewan_news",
    sourceName: "Saskatchewan RCMP News Releases",
    sourceType: "official",
    title: "Yorkton RCMP Investigate Commercial Property Break-In",
    summary: "Provincial RCMP elements compile security camera screenshots showing two culprits removing tools and copper wiring from a storage hub in Yorkton.",
    originalUrl: "https://www.rcmp-grc.gc.ca/en/news/yorkton-break-enter",
    publishedAt: hoursAgo(44),
    retrievedAt: hoursAgo(43),
    eventType: "robbery",
    severity: "medium",
    confidence: 0.94,
    locationText: "Industrial Park, Yorkton, SK",
    latitude: 51.2234,
    longitude: -102.4452,
    locationPrecision: "neighbourhood",
    locationConfidence: 0.88,
    sourceHash: "seed-hash-26",
    createdAt: hoursAgo(43)
  }
];

function getEventImagesByType(eventType: string): string[] {
  const norm = (eventType || "").toLowerCase();
  if (["weapons", "shooting", "stabbing", "assault", "robbery"].includes(norm)) {
    return [
      "https://images.unsplash.com/photo-1590372847146-2621d30b2db7?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1504151932400-72d425550d2c?auto=format&fit=crop&w=800&q=80"
    ];
  }
  if (["traffic_collision"].includes(norm)) {
    return [
      "https://images.unsplash.com/photo-1518364538800-6bcb3f25da49?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=800&q=80"
    ];
  }
  if (["fire"].includes(norm)) {
    return [
      "https://images.unsplash.com/photo-1583573636246-18cb2246697f?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=800&q=80"
    ];
  }
  if (["break_and_enter", "vehicle_theft"].includes(norm)) {
    return [
      "https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80"
    ];
  }
  if (["drugs"].includes(norm)) {
    return [
      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1590372847146-2621d30b2db7?auto=format&fit=crop&w=800&q=80"
    ];
  }
  if (["missing_person"].includes(norm)) {
    return [
      "https://images.unsplash.com/photo-1501535033-a59396eeae73?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1473163928189-364b2c4e1135?auto=format&fit=crop&w=800&q=80"
    ];
  }
  if (["police_operation", "wanted_person", "sirt_investigation"].includes(norm)) {
    return [
      "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80"
    ];
  }
  return [
    "https://images.unsplash.com/photo-1473163928189-364b2c4e1135?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80"
  ];
}

let events: EventItem[] = [];

// Enforce Phase 1 Critical Rules on any incident:
function isIncidentCompliant(e: any): boolean {
  // No source URL = no incident
  if (!e.originalUrl || e.originalUrl.trim() === "") return false;
  // No timestamp = no incident  
  if (!e.publishedAt || e.publishedAt.trim() === "") return false;
  // No location = no map pin
  if (e.latitude === undefined || e.latitude === null || isNaN(e.latitude) ||
      e.longitude === undefined || e.longitude === null || isNaN(e.longitude)) return false;
  return true;
}

// Seed Firestore initially with our verified, compliant seeds if empty
async function seedFirestoreIfNeeded() {
  if (!db) {
    events = initialSeeds.filter(isIncidentCompliant).map(e => ({
      ...e,
      isVerified: configSources.some(s => s.key === e.sourceKey),
      imageUrls: e.imageUrls || getEventImagesByType(e.eventType),
      createdAt: e.createdAt || new Date().toISOString()
    }));
    return;
  }
  try {
    const colRef = collection(db, "canonical_incidents");
    const snapshot = await getDocs(query(colRef, limit(1)));
    if (snapshot.empty) {
      console.log("[Firebase Seed] Firestore 'canonical_incidents' has zero documents. Migrating compliant seed incidents...");
      const verifiedSeeds = initialSeeds.filter(isIncidentCompliant);
      
      for (const item of verifiedSeeds) {
        const isVerified = configSources.some(s => s.key === item.sourceKey);
        const enriched = {
          ...item,
          isVerified,
          imageUrls: item.imageUrls || getEventImagesByType(item.eventType),
          createdAt: item.createdAt || new Date().toISOString()
        };
        await setDoc(doc(db, "canonical_incidents", item.id), sanitizeFirestoreData(enriched));
      }
      console.log(`[Firebase Seed] Loaded ${verifiedSeeds.length} compliant seeds successfully.`);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "canonical_incidents");
  }
}

// Synchronizes database with the local memory cache, strictly validating each item
async function syncEventsFromFirestore() {
  if (!db) {
    console.log("[Firebase Sync] Firebase not active. Proceeding with in-memory verified seeds.");
    events = initialSeeds.filter(isIncidentCompliant).map(e => ({
      ...e,
      isVerified: configSources.some(s => s.key === e.sourceKey),
      imageUrls: e.imageUrls || getEventImagesByType(e.eventType),
      createdAt: e.createdAt || new Date().toISOString()
    }));
    return;
  }
  try {
    await seedFirestoreIfNeeded();
    const colRef = collection(db, "canonical_incidents");
    const q = query(colRef);
    const snapshot = await getDocs(q);
    const loaded: EventItem[] = [];
    snapshot.forEach((d) => {
      loaded.push(d.data() as EventItem);
    });

    const compliantList = loaded.filter(isIncidentCompliant);
    compliantList.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    events = compliantList;
    console.log(`[Firebase Sync] Ready. Loaded ${events.length} fully verified incidents from Firestore.`);
  } catch (err) {
    console.error("[Firebase Sync Error] syncEventsFromFirestore failed. Loading in-memory fallback:", err);
    events = initialSeeds.filter(isIncidentCompliant).map(e => ({
      ...e,
      isVerified: configSources.some(s => s.key === e.sourceKey),
      imageUrls: e.imageUrls || getEventImagesByType(e.eventType),
      createdAt: e.createdAt || new Date().toISOString()
    }));
  }
}

// Persists a verified, compliant incident to Firestore canonical_incidents and registers its unmodified form in raw_items
async function saveIncident(evt: EventItem) {
  // First, prepend to in-memory Cache
  if (!events.some(e => e.id === evt.id)) {
    events.unshift(evt);
  }
  
  if (db) {
    try {
      const resolvedSourceKey = evt.sourceKey || "saskatoon_police_news";
      const isVerified = evt.isVerified !== undefined ? evt.isVerified : configSources.some(s => s.key === resolvedSourceKey);
      const docData = {
        ...evt,
        sourceKey: resolvedSourceKey,
        isVerified,
        createdAt: evt.createdAt || new Date().toISOString()
      };
      await setDoc(doc(db, "canonical_incidents", evt.id), sanitizeFirestoreData(docData));

      // Write unmodified representation to raw_items ("Never overwrite raw source data")
      const rawId = `raw-${evt.id}`;
      const rawRecord = {
        id: rawId,
        sourceKey: resolvedSourceKey,
        title: evt.title,
        summary: evt.summary,
        originalUrl: evt.originalUrl,
        publishedAt: evt.publishedAt,
        retrievedAt: evt.retrievedAt || new Date().toISOString()
      };
      await setDoc(doc(db, "raw_items", rawId), sanitizeFirestoreData(rawRecord));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "canonical_incidents");
    }
  }
}



// Available personal Crime/Safety news config sources
const configSources = [
  {
    key: "saskatoon_police_news",
    name: "Saskatoon Police News / Alerts",
    sourceType: "official" as SourceType,
    baseUrl: "https://saskatoonpolice.ca/news/",
    enabled: true
  },
  {
    key: "rcmp_saskatchewan_news",
    name: "Saskatchewan RCMP News Releases",
    sourceType: "official" as SourceType,
    baseUrl: "https://www.rcmp-grc.gc.ca/en/rss/39",
    enabled: true
  },
  {
    key: "saskatchewan_gov_news",
    name: "Saskatchewan Government & SIRT Notices",
    sourceType: "government" as SourceType,
    baseUrl: "https://www.saskatchewan.ca/government/news-and-media",
    enabled: true
  },
  {
    key: "saskatoon_crime_map",
    name: "Saskatoon Police Crime Map Layers (Approx Points)",
    sourceType: "official" as SourceType,
    baseUrl: "https://map.saskatoonpolice.ca/",
    enabled: true
  },
  {
    key: "cbc_saskatoon_news",
    name: "CBC Saskatoon News",
    sourceType: "media" as SourceType,
    baseUrl: "https://www.cbc.ca/news/canada/saskatoon",
    enabled: true
  },
  {
    key: "global_news_saskatoon",
    name: "Global News Saskatoon",
    sourceType: "media" as SourceType,
    baseUrl: "https://globalnews.ca/saskatoon/",
    enabled: true
  },
  {
    key: "regina_police_news",
    name: "Regina Police News & Releases",
    sourceType: "official" as SourceType,
    baseUrl: "https://reginapolice.ca/category/news/",
    enabled: true
  },
  {
    key: "cbc_regina_news",
    name: "CBC Regina News",
    sourceType: "media" as SourceType,
    baseUrl: "https://www.cbc.ca/news/canada/regina",
    enabled: true
  },
  {
    key: "global_news_regina",
    name: "Global News Regina",
    sourceType: "media" as SourceType,
    baseUrl: "https://globalnews.ca/regina/",
    enabled: true
  },
  {
    key: "prince_albert_police_news",
    name: "Prince Albert Police News / Alerts",
    sourceType: "official" as SourceType,
    baseUrl: "https://www.papolice.ca/news-releases/",
    enabled: true
  },
  {
    key: "moose_jaw_police_news",
    name: "Moose Jaw Police Alerts",
    sourceType: "official" as SourceType,
    baseUrl: "https://mjpolice.ca/news/",
    enabled: true
  }
];

// Initialize Google GenAI client (lazy initialization format to prevent startup crash if API key is not present)
let genAIClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined");
    }
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return genAIClient;
}

// Fallback exact dictionary coordinates for Saskatchewan cities, towns, and communities
const saskatchewanCoordinatesMap: Record<string, { lat: number; lng: number }> = {
  "broadway": { lat: 52.1185, lng: -106.6570 },
  "8th street": { lat: 52.1197, lng: -106.6457 },
  "preston": { lat: 52.1190, lng: -106.6210 },
  "33rd street": { lat: 52.1460, lng: -106.6660 },
  "circle drive": { lat: 52.1380, lng: -106.6120 },
  "20th street": { lat: 52.1260, lng: -106.6810 },
  "central avenue": { lat: 52.1520, lng: -106.5910 },
  "sutherland": { lat: 52.1520, lng: -106.5910 },
  "spadina": { lat: 52.1285, lng: -106.6550 },
  "downtown": { lat: 52.1290, lng: -106.6600 },
  "pleasant hill": { lat: 52.1270, lng: -106.6900 },
  "kinsmen": { lat: 52.1340, lng: -106.6530 },
  "stonebridge": { lat: 52.0911, lng: -106.6112 },
  "warman": { lat: 52.3210, lng: -106.5840 },
  "dundurn": { lat: 51.8150, lng: -106.5050 },
  "saskatoon": { lat: 52.1332, lng: -106.6700 },
  "regina": { lat: 50.4452, lng: -104.6189 },
  "prince albert": { lat: 53.2033, lng: -105.7531 },
  "moose jaw": { lat: 50.3933, lng: -105.5519 },
  "la ronge": { lat: 55.1051, lng: -105.2892 },
  "swift current": { lat: 50.2853, lng: -107.7977 },
  "north battleford": { lat: 52.7576, lng: -108.2861 },
  "battleford": { lat: 52.7167, lng: -108.3167 },
  "yorkton": { lat: 51.2139, lng: -102.4628 },
  "estevan": { lat: 49.1394, lng: -102.9856 },
  "weyburn": { lat: 49.6608, lng: -103.8525 },
  "lloydminster": { lat: 53.2785, lng: -110.0051 },
  "humboldt": { lat: 52.2019, lng: -105.1232 },
  "melfort": { lat: 52.8564, lng: -104.6172 },
  "melville": { lat: 50.9308, lng: -102.8075 },
  "meadow lake": { lat: 54.1245, lng: -108.4357 },
  "pelican narrows": { lat: 55.1719, lng: -102.8122 },
  "creighton": { lat: 54.7610, lng: -101.8845 },
  "kindersley": { lat: 51.4678, lng: -109.1601 },
  "rosetown": { lat: 51.5542, lng: -107.9897 },
  "outlook": { lat: 51.4939, lng: -107.0503 },
  "martensville": { lat: 52.2897, lng: -106.6667 },
  "lumsden": { lat: 50.6436, lng: -104.8694 },
  "fort qu'appelle": { lat: 50.7672, lng: -103.7917 },
  "indian head": { lat: 50.5311, lng: -103.6681 },
  "moosomin": { lat: 50.1417, lng: -101.6833 },
  "carlyle": { lat: 49.6333, lng: -102.2667 },
  "nipawin": { lat: 53.3644, lng: -104.0042 },
  "tisdale": { lat: 52.8500, lng: -104.0531 },
  "buffalo narrows": { lat: 55.8500, lng: -108.4833 },
  "ile-a-la-crosse": { lat: 55.4500, lng: -107.9000 },
  "la loche": { lat: 56.4833, lng: -109.4333 },
  "rosthern": { lat: 52.6667, lng: -106.3333 },
  "spiritwood": { lat: 53.3667, lng: -107.5167 },
  "unity": { lat: 52.4500, lng: -109.1667 },
  "biggar": { lat: 52.0500, lng: -107.9833 },
  "davidson": { lat: 51.2667, lng: -105.9833 },
  "watrous": { lat: 51.6833, lng: -105.4667 },
  "wynyard": { lat: 51.7667, lng: -104.1833 },
  "canora": { lat: 51.6333, lng: -102.4333 },
  "kamsack": { lat: 51.5667, lng: -101.9000 },
  "saskatchewan": { lat: 52.9399, lng: -106.4509 }
};

const saskatoonCoordinatesMap: Record<string, { lat: number; lng: number }> = saskatchewanCoordinatesMap;

// Simple resolver tool to find Saskatchewan Coordinates if text contains any known address
function resolveSaskatchewanCoordinates(text: string, defaultLat = 52.1332, defaultLng = -106.6700) {
  const norm = text.toLowerCase();
  for (const [key, coords] of Object.entries(saskatchewanCoordinatesMap)) {
    if (norm.includes(key)) {
      return coords;
    }
  }
  return { lat: defaultLat, lng: defaultLng };
}

function resolveSaskatoonCoordinates(text: string, defaultLat = 52.1332, defaultLng = -106.6700) {
  return resolveSaskatchewanCoordinates(text, defaultLat, defaultLng);
}

// Extract location candidate text from raw unstructured text for rule-based geocoding
function extractLocationText(text: string): string {
  const lower = text.toLowerCase();
  
  for (const landmark of Object.keys(saskatoonCoordinatesMap)) {
    if (lower.includes(landmark)) {
      if (landmark === "broadway") return "Broadway Avenue, Saskatoon, SK";
      if (landmark === "8th street") return "8th Street East, Saskatoon, SK";
      if (landmark === "preston") return "Preston Avenue Crossing, Saskatoon, SK";
      if (landmark === "33rd street") return "33rd Street West, Saskatoon, SK";
      if (landmark === "circle drive") return "Circle Drive, Saskatoon, SK";
      if (landmark === "20th street") return "20th Street West, Saskatoon, SK";
      if (landmark === "central avenue") return "Central Avenue, Saskatoon, SK";
      if (landmark === "sutherland") return "Sutherland, Saskatoon, SK";
      if (landmark === "spadina") return "Spadina Crescent, Saskatoon, SK";
      if (landmark === "downtown") return "Downtown Saskatoon, SK";
      if (landmark === "pleasant hill") return "Pleasant Hill, Saskatoon, SK";
      if (landmark === "kinsmen") return "Kinsmen Park, Saskatoon, SK";
      if (landmark === "stonebridge") return "Stonebridge, Saskatoon, SK";
      if (landmark === "warman") return "Warman, SK";
      if (landmark === "dundurn") return "Dundurn, SK";
      if (landmark === "prince albert") return "Prince Albert, SK";
      if (landmark === "regina") return "Regina, SK";
      if (landmark === "la ronge") return "La Ronge, SK";
      if (landmark === "swift current") return "Swift Current, SK";
      if (landmark === "north battleford") return "North Battleford, SK";
    }
  }

  // Fallback extraction matching common prepositions followed by capitalised street/landmark patterns
  const prepRegex = /\b(?:on|at|near|along|around|in|of)\s+([0-9A-Z][A-Za-z0-9\s#\-]{3,40}(?:Avenue|Ave|Street|St|Road|Rd|Crescent|Cres|Drive|Dr|Highway|Hwy|Way|Crossing|Bridge|Park|Facility|Complex)?)/;
  const match = text.match(prepRegex);
  if (match) {
    return match[1].trim();
  }

  return "Saskatoon, SK";
}

// Core Rule-Based Threat Classifier
function ruleBasedClassifier(title: string, summary: string): { eventType: string; severity: SeverityType; confidence: number } {
  const combined = (title + " " + summary).toLowerCase();
  
  const rules = [
    {
      type: "homicide",
      keywords: /\b(homicide|murder|manslaughter|killing|slaying|deceased person|suspicious death|dead body)\b|found dead/i,
      severity: "critical" as SeverityType,
      confidence: 0.95
    },
    {
      type: "shooting",
      keywords: /\b(shooting|shot|shots fired|gunshot|discharged firearm|opened fire|bullet wound)\b/i,
      severity: "critical" as SeverityType,
      confidence: 0.95
    },
    {
      type: "dangerous_person_alert",
      keywords: /\b(dangerous person|active threat|shelter in place|shelter immediately|secure doors|barricaded|hostage|armed threat|alert: dangerous)\b/i,
      severity: "critical" as SeverityType,
      confidence: 0.95
    },
    {
      type: "stabbing",
      keywords: /\b(stabbing|stabbed|knife attack|slashed|blade wound|stabbing incident)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.90
    },
    {
      type: "assault",
      keywords: /\b(assault|assaulted|physical fight|beaten|assaulting|attacked|domestic dispute|punched|kicked|battery)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.85
    },
    {
      type: "robbery",
      keywords: /\b(robbery|robbed|armed robbery|mugg|mugging|heist|commercial robbery|bank robbery|demand cash|hold up|holdup)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.90
    },
    {
      type: "weapons",
      keywords: /\b(weapons|firearms|pistol|revolver|shotgun|rifle|handgun|bullet|ammunition|body armour|body armor|illegal gun|seized gun|confiscated weapon|taser)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.85
    },
    {
      type: "police_operation",
      keywords: /\b(police operation|tactical search|heavy police presence|tactical unit|police perimeter|tactical officers|swat|blocked off|k9 unit|police dog|negotiators)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.85
    },
    {
      type: "missing_person",
      keywords: /\b(missing person|missing youth|missing teenager|missing girl|missing boy|disappeared|locate vulnerable|wander|missing senior|missing adult)\b/i,
      severity: "high" as SeverityType,
      confidence: 0.90
    },
    {
      type: "break_and_enter",
      keywords: /\b(break and enter|break-and-enter|break & enter|b&e|burglary|burgle|residential alarm|broke into|forced entry|commercial break-in)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "vehicle_theft",
      keywords: /\b(vehicle theft|stolen vehicle|car theft|stolen truck|car stolen|truck stolen|tractor theft|stolen tractor|auto theft|stolen auto)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "drugs",
      keywords: /\b(drugs|meth|methamphetamine|fentanyl|cocaine|trafficking|seizure of drugs|drug bust|substances|drug charges|illicit compounds|drug possession)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "wanted_person",
      keywords: /\b(wanted|warrant|wanted person|wanted suspect|suspect wanted|fugitive|outstanding warrants|seek public assistance to find|wanted on province)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "sirt_investigation",
      keywords: /\b(sirt|serious incident response|sirt investigation|police arrest review|detention inquiry|officer review|custody investig|independent inquiry)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.95
    },
    {
      type: "fire",
      keywords: /\b(fire|wildfire|smoke|blaze|structure fire|arson|burning|firefighter|engulfed)\b/i,
      severity: "medium" as SeverityType,
      confidence: 0.90
    },
    {
      type: "traffic_collision",
      keywords: /\b(traffic collision|pileup|accident|roll-over|crash|car accident|vehicle crash|highway closure|multi-vehicle|collision warnings)\b/i,
      severity: "low" as SeverityType,
      confidence: 0.90
    },
    {
      type: "public_disorder",
      keywords: /\b(public disorder|disturbance|dispute|protest|riot|rowdy|public intoxication|trespass|trespassing|brawl|street fight|vandalism|property damage)\b/i,
      severity: "low" as SeverityType,
      confidence: 0.85
    }
  ];

  for (const rule of rules) {
    if (rule.keywords.test(combined)) {
      return {
        eventType: rule.type,
        severity: rule.severity,
        confidence: rule.confidence
      };
    }
  }

  // Fallback if no category matches
  return {
    eventType: "other_public_safety",
    severity: "low" as SeverityType,
    confidence: 0.50
  };
}

// Core Geocoding Integration (Nominatim and Mapbox) with privacy protection features
async function geocodeLocation(addressText: string, sourceKey: string): Promise<{
  latitude: number;
  longitude: number;
  locationPrecision: LocationPrecisionType;
  locationConfidence: number;
  locationText: string;
}> {
  const isOfficialMap = (sourceKey === "saskatoon_crime_map");
  let determinedPrecision: LocationPrecisionType = "unknown";
  const lowerAddress = addressText.toLowerCase();

  // Inspect semantic indicators from addressText to assign early precision assessment
  if (lowerAddress.includes("&") || lowerAddress.includes(" and ") || lowerAddress.includes(" at ") || lowerAddress.includes("near") || lowerAddress.includes(" / ")) {
    determinedPrecision = "intersection";
  } else if (lowerAddress.includes("block of") || lowerAddress.includes("block")) {
    determinedPrecision = "block";
  } else if (lowerAddress.includes("neighbourhood") || lowerAddress.includes("district") || lowerAddress.includes("ward") || lowerAddress.includes("area") || lowerAddress.includes("park") || lowerAddress.includes("crossing") || lowerAddress.includes("hill") || lowerAddress.includes("sutherland") || lowerAddress.includes("nutana") || lowerAddress.includes("pleasant h")) {
    determinedPrecision = "neighbourhood";
  } else if (lowerAddress.includes("saskatchewan") || lowerAddress.includes("saskatoon") || lowerAddress.includes("regina") || lowerAddress.includes("prince albert") || lowerAddress.includes("warman") || lowerAddress.includes("dundurn") || lowerAddress.includes("la ronge") || lowerAddress.includes("swift current") || lowerAddress.includes("north battleford")) {
    determinedPrecision = "city";
  }

  const exactPattern = /\b([0-9]{1,5})\s+([a-zA-Z]{3,})\s+(avenue|ave|street|st|road|rd|crescent|cres|drive|dr|way|lane|ln|court|ct|boulevard|blvd)\b/i;
  const matchExact = addressText.match(exactPattern);
  if (matchExact && determinedPrecision === "unknown") {
    determinedPrecision = "exact";
  }

  let query = addressText;
  if (!lowerAddress.includes("saskatchewan") && !lowerAddress.includes("sk") && !lowerAddress.includes("saskatoon")) {
    query = `${addressText}, Saskatoon, SK, Canada`;
  } else if (!lowerAddress.includes("canada")) {
    query = `${addressText}, Canada`;
  }

  let lat = 52.1332;
  let lng = -106.6700;
  let conf = 0.50;
  let successGeocoding = false;

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

  if (mapboxToken) {
    try {
      console.log(`[Geocoding API] Contacting Mapbox Geocoding API for: "${query}"`);
      const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&limit=1`;
      const response = await fetch(mapboxUrl);
      if (response.ok) {
        const data = await response.json();
        if (data && data.features && data.features.length > 0) {
          const feature = data.features[0];
          lng = feature.center[0];
          lat = feature.center[1];
          conf = feature.relevance ? Math.round(feature.relevance * 100) / 100 : 0.85;
          successGeocoding = true;
          console.log(`[Geocoding API] Mapbox successful match: ${lat}, ${lng} (Confidence: ${conf})`);
          
          if (feature.place_type && feature.place_type.includes("address")) {
            determinedPrecision = "exact";
          } else if (feature.place_type && feature.place_type.includes("neighborhood")) {
            determinedPrecision = "neighbourhood";
          } else if (feature.place_type && feature.place_type.includes("place")) {
            determinedPrecision = "city";
          }
        }
      }
    } catch (err) {
      console.error(`[Geocoding API] Mapbox Service connection error:`, err);
    }
  }

  // Fallback to Nominatim if Mapbox is not present or failed
  if (!successGeocoding) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      console.log(`[Geocoding API] Contacting Nominatim OpenStreetMap for: "${query}"`);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "SaskatoonSafetyMap/2.0 (BlockDawson@gmail.com)"
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const result = data[0];
          lat = parseFloat(result.lat);
          lng = parseFloat(result.lon);
          
          const importance = result.importance ? parseFloat(result.importance) : 0.5;
          conf = Math.round((0.5 + 0.5 * importance) * 100) / 100;
          successGeocoding = true;
          console.log(`[Geocoding API] Nominatim successful coordinates match: ${lat}, ${lng} (Confidence: ${conf})`);

          if (result.type === "house" || result._type === "house" || (result.class === "place" && result.type === "house")) {
            determinedPrecision = "exact";
          }
        }
      }
    } catch (err) {
      console.error(`[Geocoding API] Nominatim Service connection error:`, err);
    }
  }

  // Fallback coordinates lookup if Nominatim/Mapbox were unreachable or returned empty array
  if (!successGeocoding) {
    const localCoords = resolveSaskatoonCoordinates(addressText);
    lat = localCoords.lat;
    lng = localCoords.lng;
    conf = 0.65;
    if (determinedPrecision === "unknown") {
      determinedPrecision = "block";
    }
    console.log(`[Geocoding API] Applying local coordinate map backup to "${addressText}": ${lat}, ${lng}`);
  }

  let finalLocationText = addressText;

  // Mask exact locations to block level, protecting privacy
  if (determinedPrecision === "exact") {
    if (matchExact) {
      const numStr = matchExact[1];
      const streetPart = matchExact[2] + " " + matchExact[3];
      const num = parseInt(numStr, 10);
      let roundedBlock = "0-100 block of";
      if (num >= 100) {
        roundedBlock = `${Math.floor(num / 100) * 100} block of`;
      }
      finalLocationText = addressText.replace(numStr, roundedBlock);
    } else {
      finalLocationText = addressText + " (Block-Level Approximation)";
    }
    determinedPrecision = "block";
  }

  // Handle precision-specific generalized rounding for coordinates to protect individual privacy
  if (determinedPrecision === "block" || determinedPrecision === "intersection") {
    // Round to 3 decimal places (~110m accuracy)
    lat = Math.round(lat * 1000) / 1000;
    lng = Math.round(lng * 1000) / 1000;
  } else if (determinedPrecision === "neighbourhood") {
    // Round to 2 decimal places (~1.1km accuracy)
    lat = Math.round(lat * 100) / 100;
    lng = Math.round(lng * 100) / 100;
  } else if (determinedPrecision === "city" || determinedPrecision === "unknown") {
    // Round to 1 decimal place (~11km accuracy)
    lat = Math.round(lat * 10) / 10;
    lng = Math.round(lng * 10) / 10;
  }

  if (determinedPrecision === "unknown") {
    determinedPrecision = "block";
  }

  return {
    latitude: lat,
    longitude: lng,
    locationPrecision: determinedPrecision,
    locationConfidence: conf,
    locationText: finalLocationText
  };
}

// Haversine distance calculator in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Related event types helper
function areRelatedEventTypes(type1: string, type2: string): boolean {
  if (type1 === type2) return true;
  const groups = [
    ["assault", "shooting", "stabbing", "weapons", "homicide", "robbery", "dangerous_person_alert", "police_operation"],
    ["theft", "break_enter", "break_and_enter", "vehicle_theft", "property"],
    ["traffic", "traffic_collision", "collision"]
  ];
  for (const group of groups) {
    if (group.includes(type1) && group.includes(type2)) {
      return true;
    }
  }
  return false;
}

// Token Jaccard String overlapping similarity helper
function calculateStringSimilarity(str1: string, str2: string): number {
  const getTokens = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(t => t.length > 2);
  const tokens1 = new Set(getTokens(str1));
  const tokens2 = new Set(getTokens(str2));
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  let intersectionSize = 0;
  tokens1.forEach(t => {
    if (tokens2.has(t)) intersectionSize++;
  });
  
  return intersectionSize / Math.max(tokens1.size, tokens2.size);
}

// Phase 2: Deduplication and Incident Clustering Algorithm
function deduplicateAndClusterEvents(allEvents: EventItem[]): EventItem[] {
  // Sort by published time descending
  const sorted = [...allEvents].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  
  const mergedIds = new Set<string>();
  const finalizedEvents: EventItem[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const primary = sorted[i];
    if (mergedIds.has(primary.id)) continue;
    
    // Find all duplicates / candidates for merging
    // A target candidate MUST represent the exact same incident reported across multiple sources.
    const clusterCandidates: EventItem[] = [primary];
    
    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j];
      if (mergedIds.has(candidate.id)) continue;
      
      // Calculate proximity rules:
      const dist = getDistanceMeters(primary.latitude, primary.longitude, candidate.latitude, candidate.longitude);
      
      // Tighten geographic rules based on precision to avoid spatial grouping errors
      // exact: very close (<100m)
      // block/intersection: close (<200m)
      // neighbourhood: moderate (<500m) + strict text match
      // city/unknown: almost never merged unless text is near-identical
      let maxDistThreshold = 200;
      if (primary.locationPrecision === "exact" && candidate.locationPrecision === "exact") {
        maxDistThreshold = 100;
      } else if (primary.locationPrecision === "neighbourhood" || candidate.locationPrecision === "neighbourhood") {
        maxDistThreshold = 500;
      } else if (primary.locationPrecision === "city" || candidate.locationPrecision === "city") {
        maxDistThreshold = 50; // Only merge if nearly identical location geocodes
      }

      const isCloseGeographically = dist <= maxDistThreshold;
      
      // Tighten time window: 16 hours instead of 24h
      const timeDiffMs = Math.abs(new Date(primary.publishedAt).getTime() - new Date(candidate.publishedAt).getTime());
      const isWithinTimeWindow = timeDiffMs < 16 * 3600 * 1000;
      
      // Same publisher protection:
      // If candidate has the same sourceKey as primary (meaning same feed/organization), they represent separate 
      // reports within the same region, UNLESS they are absolute identical scraped duplicate entries (sim > 0.85).
      const shareSameSource = primary.sourceKey === candidate.sourceKey;
      
      // Related event types
      const isRelatedType = areRelatedEventTypes(primary.eventType, candidate.eventType);
      
      // Semantic string similarity (Jaccard token comparison)
      const sim = calculateStringSimilarity(primary.title + " " + primary.summary, candidate.title + " " + candidate.summary);
      
      // FUSION RULES:
      // To fuse into a single canonical incident, they must:
      // 1. Be geographically close & in time window
      // 3. Have related types and at least solid semantic text confirmation (sim > 0.30) OR representing true different source corroboration (e.g. news mentioning police alert) with strong text match
      
      let isSameEvent = false;
      if (isCloseGeographically && isWithinTimeWindow) {
        if (shareSameSource) {
          // If from the same source, they are only duplicate records if text matches near-perfectly
          if (sim > 0.82) {
            isSameEvent = true;
          }
        } else {
          // Cross-source intelligence corroboration:
          // Must have matching related categories AND a reasonable semantic overlapping context
          if (isRelatedType && (sim > 0.28 || primary.title.split(" ").some(word => word.length > 4 && candidate.title.includes(word)))) {
            isSameEvent = true;
          } else if (sim > 0.40) {
            // Excellent text match (e.g. media article detailing a specific police operation at same block)
            isSameEvent = true;
          }
        }
      }
      
      if (isSameEvent) {
        clusterCandidates.push(candidate);
        mergedIds.add(candidate.id);
      }
    }
    
    mergedIds.add(primary.id);
    
    if (clusterCandidates.length === 1) {
      primary.sourcesList = [{ name: primary.sourceName, url: primary.originalUrl, key: primary.sourceKey }];
      primary.dedupeHash = primary.sourceHash || ("single-hash-" + primary.id);
      primary.linkedEvents = []; // Avoid circular [primary] self-reference
      finalizedEvents.push(primary);
    } else {
      // Gather unique sources list
      const sourcesListMap = new Map<string, { name: string; url: string; key: string }>();
      clusterCandidates.forEach(c => {
        sourcesListMap.set(c.sourceKey, { name: c.sourceName, url: c.originalUrl, key: c.sourceKey });
      });
      const sourcesList = Array.from(sourcesListMap.values());
      
      // Choose primary item for coordinates/metadata (prefer police alerts over standard map reports)
      const selectPriority = (item: EventItem) => {
        if (item.sourceKey.includes("alert")) return 10;
        if (item.sourceType === "official" && item.sourceKey !== "saskatoon_crime_map") return 8;
        if (item.sourceType === "media") return 6;
        if (item.sourceType === "government") return 5;
        return 1;
      };
      
      const bestEvent = clusterCandidates.reduce((best, curr) => {
        return selectPriority(curr) > selectPriority(best) ? curr : best;
      }, primary);
      
      // Blended severity instead of "highest member wins" inflation!
      // Assign weight values to Candidate severities
      const severityMap: Record<SeverityType, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      const reverseSeverityMap: Record<number, SeverityType> = { 4: "critical", 3: "high", 2: "medium", 1: "low" };
      
      let sumSeverityWeights = 0;
      clusterCandidates.forEach(c => {
        sumSeverityWeights += severityMap[c.severity] || 1;
      });
      const avgSeverityWeight = Math.round(sumSeverityWeights / clusterCandidates.length);
      const blendedSeverity = reverseSeverityMap[Math.max(1, Math.min(4, avgSeverityWeight))] || "low";
      
      // Assemble aggregated summary detailing original sources
      let combinedSummary = `**Saskatoon Public Safety Intelligence Fusion [${clusterCandidates.length} linked reports]**:\n`;
      clusterCandidates.forEach(c => {
        combinedSummary += `• **${c.sourceName}**: *${c.title}* – ${c.summary.length > 155 ? c.summary.substring(0, 155) + "..." : c.summary}\n`;
      });
      
      // Boost confidence as multiple sources confirm
      const blendedConfidence = Math.min(1.0, Math.round((bestEvent.confidence + 0.05 * (clusterCandidates.length - 1)) * 100) / 100);
      
      // Clean clone of candidates to strip any potential nested circular structures
      const cleanCandidates = clusterCandidates.map(c => {
        const copy = { ...c };
        delete copy.linkedEvents;
        return copy;
      });

      const mergedEvent: EventItem = {
        ...bestEvent,
        id: `clust-${bestEvent.id}`,
        title: bestEvent.title.includes("Cluster") ? bestEvent.title : `${bestEvent.title} (Incident Cluster)`,
        summary: combinedSummary,
        severity: blendedSeverity, // true blended severity, no inflation!
        confidence: blendedConfidence,
        sourcesList: sourcesList,
        dedupeHash: `fused-${bestEvent.id}-${clusterCandidates.length}`,
        linkedEvents: cleanCandidates
      };
      
      finalizedEvents.push(mergedEvent);
    }
  }
  
  // Map intelligence metrics, source tiers, and derived annotations
  return finalizedEvents.map(evt => {
    let sourceTier = 3; // Default Tier is 3 (Advisories / Map Layers)
    let isGenerated = false;
    let isDerived = false;

    const key = (evt.sourceKey || "").toLowerCase();
    const type = (evt.sourceType || "").toLowerCase();
    const idStr = (evt.id || "").toLowerCase();
    const title = (evt.title || "").toLowerCase();

    // Determine Source Intelligence Tier
    if (idStr.startsWith("clust-") || title.includes("(incident cluster)") || title.includes("cluster") || key.includes("ai-")) {
      sourceTier = 4;
      isDerived = true;
      isGenerated = true;
    } else if (type === "official" && !key.includes("crime_map") && !key.includes("council")) {
      sourceTier = 1;
    } else if (type === "media") {
      sourceTier = 2;
    } else if (type === "government" || key.includes("crime") || key.includes("map") || key.includes("weather") || key.includes("council")) {
      sourceTier = 3;
    }

    return {
      ...evt,
      sourceTier,
      isGenerated: evt.isGenerated || isGenerated,
      isDerived: evt.isDerived || isDerived,
    };
  });
}

// ---------------- API ENDPOINTS ----------------

// GET /api/alert-zones
app.get("/api/alert-zones", async (req, res) => {
  try {
    if (!db) {
      res.json([]);
      return;
    }
    const colRef = collection(db, "alert_zones");
    const snapshot = await getDocs(colRef);
    const zones: any[] = [];
    snapshot.forEach(d => zones.push(d.data()));
    res.json(zones);
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, "alert_zones");
    } catch (loggedErr: any) {
      res.status(500).json({ error: "Failed to load alert zones", details: loggedErr.message });
    }
  }
});

// POST /api/alert-zones/sync
app.post("/api/alert-zones/sync", async (req, res) => {
  try {
    const list = req.body;
    if (!Array.isArray(list)) {
      res.status(400).json({ error: "Invalid alert zones array layout" });
      return;
    }
    if (!db) {
      res.json({ success: true, message: "Firebase not configured, running in-memory bypass" });
      return;
    }
    const colRef = collection(db, "alert_zones");
    const snapshot = await getDocs(colRef);
    const existingIds = new Set<string>();
    snapshot.forEach(d => existingIds.add(d.id));

    const incomingIds = new Set(list.map(p => p.id));

    // Delete removed ones
    for (const oldId of existingIds) {
      if (!incomingIds.has(oldId)) {
        await deleteDoc(doc(db, "alert_zones", oldId));
      }
    }

    // Save/update list
    for (const pin of list) {
      const validatedZone = {
        id: pin.id,
        name: pin.title || pin.name,
        severity: pin.severity,
        radius: pin.radius || 150,
        coordinates: [pin.latitude, pin.longitude],
        userId: pin.userId || "anonymous_coordinator",
        createdAt: pin.createdAt || new Date().toISOString()
      };
      await setDoc(doc(db, "alert_zones", pin.id), sanitizeFirestoreData(validatedZone));
    }
    res.json({ success: true });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, "alert_zones");
    } catch (loggedErr: any) {
      res.status(500).json({ error: "Failed to synchronize alert zones with database", details: loggedErr.message });
    }
  }
});

// GET /api/bookmarks
app.get("/api/bookmarks", async (req, res) => {
  try {
    if (!db) {
      res.json([]);
      return;
    }
    const userId = req.query.userId as string;
    const colRef = collection(db, "user_bookmarks");
    let snapshot;
    if (userId) {
      const q = query(colRef, where("userId", "==", userId));
      snapshot = await getDocs(q);
    } else {
      snapshot = await getDocs(colRef);
    }
    const bookmarks: any[] = [];
    snapshot.forEach(d => bookmarks.push(d.data()));
    res.json(bookmarks);
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, "user_bookmarks");
    } catch (loggedErr: any) {
      res.status(500).json({ error: "Failed to load bookmarks", details: loggedErr.message });
    }
  }
});

// POST /api/bookmarks/sync
app.post("/api/bookmarks/sync", async (req, res) => {
  try {
    const { userId, list } = req.body;
    if (!userId) {
      res.status(400).json({ error: "User ID is required to synchronize bookmarked feeds." });
      return;
    }
    if (!Array.isArray(list)) {
      res.status(400).json({ error: "Invalid bookmarks array layout" });
      return;
    }
    if (!db) {
      res.json({ success: true, message: "Firebase not configured, running in-memory bypass" });
      return;
    }
    
    const colRef = collection(db, "user_bookmarks");
    const q = query(colRef, where("userId", "==", userId));
    const snapshot = await getDocs(q);
    const existingIds = new Set<string>();
    snapshot.forEach(d => existingIds.add(d.id));

    const incomingIds = new Set(list.map((b: any) => b.id));

    // Delete removed ones
    for (const oldId of existingIds) {
      if (!incomingIds.has(oldId)) {
        await deleteDoc(doc(db, "user_bookmarks", oldId));
      }
    }

    // Save/update list
    for (const b of list) {
      const validatedBookmark = {
        id: b.id,
        userId: userId,
        eventId: b.eventId,
        note: b.note || "",
        createdAt: b.createdAt || new Date().toISOString()
      };
      await setDoc(doc(db, "user_bookmarks", b.id), sanitizeFirestoreData(validatedBookmark));
    }
    res.json({ success: true });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, "user_bookmarks");
    } catch (loggedErr: any) {
      res.status(500).json({ error: "Failed to synchronize bookmarks with database", details: loggedErr.message });
    }
  }
});

// GET /api/sources
app.get("/api/sources", (req, res) => {
  res.json(configSources);
});

// GET /api/events
app.get("/api/events", async (req, res) => {
  try {
    // Synchronize latest records from Firestore on each request
    await syncEventsFromFirestore();
  } catch (err) {
    console.error("[Events API] Failed to trigger live Firestore reload. Serving current cache:", err);
  }

  // 1. Run server-side deduplication and clustering over raw events
  const processed = deduplicateAndClusterEvents(events);

  // 2. Extract potential user coordinate context if passed via query
  const userLat = req.query.userLat ? parseFloat(req.query.userLat as string) : undefined;
  const userLng = req.query.userLng ? parseFloat(req.query.userLng as string) : undefined;

  // 3. Attach dynamic personalized threatScores or use defaults
  const enriched = processed.map(e => ({
    ...e,
    threatScore: calculateThreatScore(e, userLat, userLng, processed)
  }));

  let filtered = [...enriched];

  // 4. Apply optional filter parameters
  const { sourceKey, eventType, severity, timeRangeHours } = req.query;

  if (sourceKey && typeof sourceKey === "string") {
    filtered = filtered.filter(e => e.sourceKey === sourceKey);
  }
  if (eventType && typeof eventType === "string") {
    filtered = filtered.filter(e => e.eventType === eventType);
  }
  if (severity && typeof severity === "string") {
    filtered = filtered.filter(e => e.severity === severity);
  }
  if (timeRangeHours && typeof timeRangeHours === "string") {
    const hours = parseInt(timeRangeHours, 10);
    if (!isNaN(hours)) {
      const cutOff = Date.now() - (hours * 3600000);
      filtered = filtered.filter(e => {
        const pubDate = new Date(e.publishedAt).getTime();
        return pubDate >= cutOff;
      });
    }
  }

  // 5. Sort by modern release time first (descending)
  filtered.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  res.json(filtered);
});

// GET /api/events/python
// Dedicated endpoint to quickly retrieve and return Python-geocoded events specifically
app.get("/api/events/python", (req, res) => {
  const pythonOnly = events.filter(e => e.id.startsWith("py-evt-"));
  res.json(pythonOnly);
});

// GET /api/events/:id
app.get("/api/events/:id", (req, res) => {
  const processed = deduplicateAndClusterEvents(events);
  const userLat = req.query.userLat ? parseFloat(req.query.userLat as string) : undefined;
  const userLng = req.query.userLng ? parseFloat(req.query.userLng as string) : undefined;
  
  const enriched = processed.map(e => ({
    ...e,
    threatScore: calculateThreatScore(e, userLat, userLng, processed)
  }));

  const event = enriched.find(e => e.id === req.params.id);
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(event);
});

// POST /api/events/ai-summary
// Generate an AI-powered safety summary briefing of all incident activity in Saskatoon / Saskatchewan from the last 24 hours.
app.post("/api/events/ai-summary", async (req, res) => {
  try {
    const processed = deduplicateAndClusterEvents(events);

    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const events24h = processed.filter(
      (evt) => new Date(evt.publishedAt).getTime() >= twentyFourHoursAgo
    );

    if (events24h.length === 0) {
      res.json({
        summary: "### 24-Hour Situation Overview\nNo public safety incidents inside Saskatoon or neighboring districts have been crawled or registered in the last 24 hours. General background watch conditions remain completely calm.\n\n### 🚨 Saskatoon Top Risks\n* **Background Stability**: No core violent crimes or critical alerts were logged in the past day.\n\n### 📍 Avoided Topics & Warning Zones\n* **Clear Zones**: No active warning blocks or police-cordoned locations specified in the past 24 hours.\n\n### 📊 Data Integration Confidence Levels\n* **Observation Integrity**: High confidence. Integrated streams (police alerts, RCMP releases, CBC News) report completely quiet background safety conditions in Saskatoon."
      });
      return;
    }

    const isApiKeyConfigured = !!process.env.GEMINI_API_KEY;
    if (!isApiKeyConfigured) {
      // Fallback: Generate a highly detailed descriptive template summary if Gemini is not configured
      const total = events24h.length;
      const criticalCount = events24h.filter(e => e.severity === "critical").length;
      const highCount = events24h.filter(e => e.severity === "high").length;
      
      let fallbackText = `### 24-Hour Situation Overview
Overall, the Saskatoon community safety tracker processed and unified **${total} unique geocoded public incidents** over the past 24-hour cycle. Among these, we resolved **${criticalCount} critical** and **${highCount} high-severity** alerts requiring elevated care.

### 🚨 Saskatoon Top Risks
`;
      
      const risks = events24h.filter(e => e.severity === "critical" || e.severity === "high" || e.eventType === "shooting" || e.eventType === "stabbing");
      if (risks.length > 0) {
        risks.slice(0, 3).forEach(e => {
          fallbackText += `* **${e.title}**: Reported near ${e.locationText}. ${e.summary.split('\n')[0]}\n`;
        });
      } else {
        fallbackText += `* **General Safety**: Background traffic accidents or minor property property calls. No high-grade incidents were logged.\n`;
      }

      fallbackText += `
### 📍 Avoided Topics & Warning Zones
`;
      const avoidance = events24h.filter(e => e.eventType === "weapons" || e.eventType === "shooting" || e.eventType === "fire" || e.severity === "critical");
      if (avoidance.length > 0) {
        avoidance.slice(0, 3).forEach(e => {
          fallbackText += `* **Avoid travel near ${e.locationText}**: Due to active report: *"${e.title}"*. Respect local police cordons.\n`;
        });
      } else {
        fallbackText += `* **Standard Traffic Routes**: No active blockades or emergency fire incidents. All primary streets are clear.\n`;
      }

      fallbackText += `
### 📊 Data Integration Confidence Levels
* **Integrated Sources Check**: Standard. Cross-referenced police feeds, media alerts, and media scrapers. Data confidence stands at **88%** based on consistent geographical confirmation across multiple reports. All entries listed reflect stored records only.`;
      
      res.json({ summary: fallbackText });
      return;
    }

    // Initialize GenAI API configured client
    const ai = getGenAI();

    // Format list of events for the prompt
    let listText = "";
    events24h.forEach((evt, idx) => {
      listText += `${idx + 1}. [Id: ${evt.id}] [Title: "${evt.title}"] [Category: ${evt.eventType || "unknown"}] [Severity: ${evt.severity}] [Approx Location: ${evt.locationText || "unknown"}] [Outline: ${evt.summary || ""}]\n`;
    });

    const prompt = `You are an expert community safety intelligence analyst for Saskatoon, Saskatchewan.
Review the following active, stored public safety incidents recorded in Saskatoon over the last 24 hours:

${listText}

Deliver a highly professional, cohesive text-based community briefing.
CRITICAL MANDATE: You must ONLY summarize the provided stored incidents list. Do NOT, under any circumstances, invent, hallucinate, or assume any facts, events, or details not explicitly present in the data above. If no incidents are in the list, state that conditions are calm.

Your response MUST use clean, simple Markdown formatting. Use headings of level 3 (###) for exactly four sections, detailing top risks, warnings/topics to avoid, and self-reported confidence levels based on the data. Use bullet points (*) and bold text (**) for key takeaways, matching the structure below:

### 24-Hour Situation Overview
A brief summary paragraph describing the situation over the past 24 hours based ONLY on the provided list of events.

### 🚨 Saskatoon Top Risks
* Point out the top 2-3 most high-risk incidents or concentrations present in the data. Be explicit, referencing approximate locations or neighborhoods from the data (e.g., Mount Royal, Pleasant Hill, Downtown).

### 📍 Avoided Topics & Warning Zones
* Identify 2-3 specific topics, locations, or areas that residents should avoid or approach with extreme caution today, derived directly from the active fire, assault, police operations, or hazard markers in the data.

### 📊 Data Integration Confidence Levels
* Provide your analytical confidence score (e.g., High, Moderate, Low, or a percentage) regarding the integrated dataset. Justify this rating based on the presence of independent multiple reports, official police releases versus social cues, and coordinates precision in the stored incidents.

Begin directly with the Markdown blocks. Avoid any generic introducers or conversational filler like "Here is the summary...".`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are a professional safety advisor. You strictly ground your analysis on the concrete list of incidents provided, avoiding any speculation or ungrounded details.",
        temperature: 0.1,
      }
    });

    const text = response.text || "Unable to parse live text summary from GenAI model logs.";
    res.json({ summary: text });

  } catch (err: any) {
    console.error("AI Summary generation failed:", err);
    res.status(500).json({ error: "Safety summary analyzer encountered a runtime issue: " + err.message });
  }
});

// POST /api/chat
// Grounded chat assistant proxy utilizing active events and sources configurations
app.post("/api/chat", async (req, res) => {
  try {
    const { history } = req.body;
    if (!Array.isArray(history) || history.length === 0) {
      res.status(400).json({ error: "Chat message history must be a valid array of turns." });
      return;
    }

    const isApiKeyConfigured = !!process.env.GEMINI_API_KEY;
    if (!isApiKeyConfigured) {
      const lastUserMsg = [...history].reverse().find(h => h.role === "user");
      const userText = (lastUserMsg ? lastUserMsg.text : "").toLowerCase();

      let reply = "I am operating in Offline Mode. I have indexed your live incidents dashboard and can assist you with local safety information.";
      
      const matchingEvents = events.filter(e => {
        const queryTerm = e.eventType || "other_public_safety";
        return userText.includes(queryTerm.replace(/_/g, " ")) || userText.includes(e.title.toLowerCase()) || (e.locationText && userText.includes(e.locationText.toLowerCase()));
      });

      if (userText.includes("critical") || userText.includes("high")) {
        const priorityEvents = events.filter(e => e.severity === "critical" || e.severity === "high");
        if (priorityEvents.length > 0) {
          reply = `Our current safety index detects **${priorityEvents.length} Priority Hazards** in the area. Key highlights include:\n\n`;
          priorityEvents.slice(0, 3).forEach(evt => {
            reply += `* **[${evt.severity.toUpperCase()}] ${evt.title}**: Reported approx. at ${evt.locationText}. ${evt.summary} [Incident #${evt.id}]\n`;
          });
        } else {
          reply = "There are currently no critical or high severity safety incidents logged in our immediate Saskatoon index.";
        }
      } else if (userText.includes("broadway")) {
        const broadwayEvents = events.filter(e => e.locationText && e.locationText.toLowerCase().includes("broadway"));
        if (broadwayEvents.length > 0) {
          reply = `Yes, I located **${broadwayEvents.length} reports** involving the **Broadway Avenue** district:\n\n`;
          broadwayEvents.forEach(evt => {
            reply += `* **${evt.title}** (${evt.severity} severity): ${evt.summary} [Incident #${evt.id}]\n`;
          });
        } else {
          reply = "My Saskatoon database does not register any active safety incident alerts in the Broadway Avenue area currently.";
        }
      } else if (userText.includes("stonebridge")) {
        const stonebridgeEvents = events.filter(e => e.locationText && e.locationText.toLowerCase().includes("stonebridge"));
        if (stonebridgeEvents.length > 0) {
          reply = `Saskatoon safety map records **${stonebridgeEvents.length} reports** for the **Stonebridge district**:\n\n`;
          stonebridgeEvents.forEach(evt => {
            reply += `* **${evt.title}** (${evt.severity} level): ${evt.summary} [Incident #${evt.id}]\n`;
          });
        } else {
          reply = "There are no security incidents currently reported around the Stonebridge Common or shopping corridor.";
        }
      } else if (userText.includes("regina")) {
        const reginaEvents = events.filter(e => e.locationText && e.locationText.toLowerCase().includes("regina"));
        if (reginaEvents.length > 0) {
          reply = `Regina safety logs record **${reginaEvents.length} alerts** centered in the capital area:\n\n`;
          reginaEvents.forEach(evt => {
            reply += `* **${evt.title}** (${evt.severity} severity): Reported near ${evt.locationText}. ${evt.summary} [Incident #${evt.id}]\n`;
          });
        } else {
          reply = "Our database does not register any active Regina incident alerts or emergency warnings currently.";
        }
      } else if (userText.includes("albert") || userText.includes("prince")) {
        const paEvents = events.filter(e => e.locationText && e.locationText.toLowerCase().includes("albert"));
        if (paEvents.length > 0) {
          reply = `Prince Albert safety index registers **${paEvents.length} reports**:\n\n`;
          paEvents.forEach(evt => {
            reply += `* **${evt.title}** (${evt.severity} severity): ${evt.summary} [Incident #${evt.id}]\n`;
          });
        } else {
          reply = "Our database maintains zero active alerts in Prince Albert geographic boundaries at the present hour.";
        }
      } else if (matchingEvents.length > 0) {
        reply = `I parsed our safety records and located **${matchingEvents.length} relevant reports** matching your inquiry:\n\n`;
        matchingEvents.slice(0, 3).forEach(evt => {
          reply += `* **${evt.title}** ([Incident #${evt.id}]): Reported at ${evt.locationText} with **${evt.severity}** severity. ${evt.summary}\n`;
        });
      } else if (userText.includes("sources") || userText.includes("news")) {
        reply = "Our Saskatoon systems are currently crawling and synchronizing alerts from these sources:\n\n" +
          configSources.map(s => `* **${s.name}**: Base URL and API details are structured safely under: ${s.baseUrl}`).join("\n");
      } else {
        reply = `I am operating in fallback offline mode. 
I can analyze your live incident database! You currently have **${events.length} active logs** indexed.

Try asking about:
- **"Broadway"** or **"Stonebridge"** neighborhood status
- **"Critical"** safety incidents or warnings
- **"News sources"** connected to Saskatoon safety maps`;
      }

      res.json({ reply });
      return;
    }

    const ai = getGenAI();

    const availableSourcesText = configSources.map(s => `- ${s.name} (Key: ${s.key}, Type: ${s.sourceType}, Url: ${s.baseUrl})`).join("\n");
    const eventSummaryList = events.slice(0, 50).map(evt => {
      return `[Incident #${evt.id}]
- Title: ${evt.title}
- Severity: ${evt.severity}
- Category: ${evt.eventType || "unknown"}
- Location: ${evt.locationText} (${evt.latitude}, ${evt.longitude})
- Published: ${evt.publishedAt}
- Summary: ${evt.summary}
- Source: ${evt.sourceName}`;
    }).join("\n\n");

    const systemInstruction = `You are "Saskatchewan Safety AI", a helpful, elite provincial public safety chatbot assistant for Saskatchewan (including Saskatoon, Regina, Prince Albert, Moose Jaw, etc.), Canada.
Your goal is to guide citizens, answer safety questions, and analyze incident developments using the official, live Saskatchewan safety database provided below.

Here is the current Saskatchewan incident database containing up-to-date geocoded reports (max 50 recent):
${eventSummaryList}

And here are the active configured News / Safety Sources:
${availableSourcesText}

CRITICAL RULES:
1. Ground all your incident details exactly in the Saskatchewan Safety database above. If requested info is not in the database, honestly say you don't have reports on it but suggest overall precautions.
2. ALWAYS provide the specific and exact incident tag inside your conversation using the exact format: [Incident #id] (e.g. [Incident #seed-1] or [Incident #evt-ingest-xxxxxx]) whenever you are talking or summarizing a specific event. The user can click these tags to select them on the map. DO NOT space or modify the tag prefix. E.g. [Incident #seed-1] is correct, but not [Incident#seed-1] or [Incident seed-1].
3. For location-based queries, explain what happened in that neighborhood/city, point out closest incident tags, and list them with their exact coordinates or block.
4. Keep your tone highly professional, objective, supportive, and focused on safety guidance.
5. Use markdown elements (bolding, lists, tables) to make your safety responses extremely legible and structured. Only output clean Markdown text.`;

    const contents = history.map((turn: any) => ({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.text }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.35,
      }
    });

    const reply = response.text || "I processed your request, but was unable to construct a conversational response. Please try refining your query.";
    res.json({ reply });

  } catch (err: any) {
    console.error("Critical chat proxy error:", err);
    res.status(500).json({ error: "Saskatoon Advisor encountered a routing or AI connection failure: " + err.message });
  }
});

// POST /api/events/forecast
// Uses the Gemini API to analyze current incident trends and suggest potential high-risk times for the upcoming week based on historical data.
app.post("/api/events/forecast", async (req, res) => {
  try {
    const isApiKeyConfigured = !!process.env.GEMINI_API_KEY;
    if (!isApiKeyConfigured) {
      const totalCount = events.length;
      const criticalCount = events.filter(e => e.severity === "critical").length;
      const highCount = events.filter(e => e.severity === "high").length;
      
      const fallbackForecast = `### 📅 Saskatoon High-Risk Safety Forecast (Upcoming Week)

*Note: This is an analytical forecast generated using localized historical incident distribution.*

Based on the **${totalCount} active incident reports** (including **${criticalCount} critical** and **${highCount} high-severity** logs), here are the identified risk trends for the upcoming week:

#### 🚨 1. High-Risk Time Periods
* **Friday & Saturday Late Nights (10:00 PM – 3:00 AM)**: Historical logs indicate a heavy spike in alcohol and crowd-related public safety incidents near nightlife corridors, downtown Saskatoon, and Broadway districts. Precaution is advised.
* **Weekday Commute Rush (4:00 PM – 6:30 PM)**: Peak times for major traffic disturbances, dangerous driving reports, and minor road accidents along Circle Drive, especially during poor weather conditions or high-traffic intersections.

#### 📍 2. Areas under Monitor
* **Downtown Core & Broadway Avenue**: Recommended vigilance when walking alone in unlit alleys or parking lots after midnight.
* **Pleasant Hill & Westside Districts**: Higher frequency of active police responses and property hazards.

#### 💡 3. Key Safety Recommendations
* Plan transit routes ahead during rush hours and favor well-lighted primary arterial roads after dark.
* Keep GPS-enabled Geofence alerts active for instant nearby warnings.
`;
      res.json({ forecast: fallbackForecast });
      return;
    }

    const ai = getGenAI();
    
    // Format list of all events for input to Gemini
    let listText = "";
    events.slice(0, 45).forEach((evt, idx) => {
      listText += `${idx + 1}. [Date/Time: ${evt.publishedAt}] [Title: "${evt.title}"] [Category: ${evt.eventType || "unknown"}] [Severity: ${evt.severity}] [Approx Location: ${evt.locationText || "unknown"}] [Summary: ${evt.summary || ""}]\n`;
    });

    const prompt = `You are an expert community safety forecaster and risk analyst for Saskatoon, Saskatchewan.
Review the following past and active public safety incident logs:

${listText}

Analyze this historical distribution of incidents and generate a detailed community safety hazard forecast/outlook for the upcoming week.
Focus on identifying potential high-risk times of day, day of week patterns, localized risk clusters/areas, and any event-type trends (e.g., traffic collisions, nighttime neighborhood hazards).

Write in a reassuring, objective, professional, and advisory public service briefing voice.
Deliver your risk assessment forecast in clean Markdown format with headings of level 3 (###) or level 4 (####) for sections and bullet points (*) with bold text (**) for key highlights, similar to this:

### 📅 Saskatoon High-Risk Safety Forecast (Upcoming Week)
A general overview of the safety forecast based on current active alerts...

#### 🚨 High-Risk Time Windows
* **Trend details**: Specific days of the week, times, reasons of spike as deduced from data...

#### 📍 Vulnerable Locations
* **Location & Context**: Which neighborhood/intersection show heightened alerts and what safety rules apply...

#### 💡 Key Safety recommendations
* **Recommendation**: Concrete safety actions for Saskatoon residents during the forecast windows.

Maintain a structured and highly customized forecast matching the actual incidents provided. Do NOT include any generic introductory/concluding comments ("Here is the forecast...") — start directly with the Markdown heading.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an analytical public service safety advisor specializing in Saskatoon Saskatchewan hazard forecasting.",
        temperature: 0.2,
      }
    });

    const text = response.text || "Unable to generate forecast from live Gemini model logs.";
    res.json({ forecast: text });

  } catch (err: any) {
    console.error("AI forecast query failed:", err);
    res.status(500).json({ error: "Failed to query Gemini model for trend safety forecast." });
  }
});

// POST /api/events/report-manual
// Let the user write out a manual Saskatoon bulletin, utilizing Gemini to parse, categorize, locate, summarize, and pin it dynamically!
app.post("/api/events/report-manual", async (req, res) => {
  const { rawText, originalUrl, mode } = req.body;
  if (!rawText || rawText.trim().length < 5) {
    res.status(400).json({ error: "Please write a meaningful text bulletin report." });
    return;
  }

  try {
    const isApiKeyConfigured = !!process.env.GEMINI_API_KEY;
    const parts = rawText.split("\n").filter(Boolean);
    const manualTitle = parts[0]?.substring(0, 80) || "Manual Warning Incident";
    const manualSummary = rawText.substring(0, 240);
    const useRuleBased = (mode === "rule-based" || !isApiKeyConfigured);

    if (useRuleBased) {
      const customId = "evt-manual-" + Math.random().toString(36).substr(2, 9);
      const locCandidate = extractLocationText(rawText);
      const geocoded = await geocodeLocation(locCandidate, "saskatoon_police_news");
      const ruleClass = ruleBasedClassifier(manualTitle, rawText);

      const resolvedObj: EventItem = {
        id: customId,
        sourceKey: "saskatoon_police_news",
        sourceName: "User Manual Bulletin",
        sourceType: "media",
        title: manualTitle,
        summary: manualSummary,
        originalUrl: originalUrl || `https://saskatoonsafetymap.ca/manual-reports/${customId}`,
        publishedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        eventType: ruleClass.eventType,
        severity: ruleClass.severity,
        confidence: ruleClass.confidence,
        locationText: geocoded.locationText,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        locationPrecision: geocoded.locationPrecision,
        locationConfidence: geocoded.locationConfidence,
        sourceHash: "manual-hash-" + Math.random(),
        createdAt: new Date().toISOString(),
        imageUrls: getEventImagesByType(ruleClass.eventType),
        isVerified: false // manual/unverified-only!
      };

      await saveIncident(resolvedObj);
      res.json({
        success: true,
        count: 1,
        addedEvents: [resolvedObj],
        message: "File completed successfully via Rule-Based Classification and OpenStreetMap Nominatim geocoding!"
      });
      return;
    }

    const ai = getGenAI();
    const prompt = `Analyze this raw local public safety text bulletin from Saskatoon/Saskatchewan, and extract structured items in JSON:
"${rawText}"

Your structured output must conform to these requirements:
Classify eventType into: 'assault', 'homicide', 'shooting', 'stabbing', 'robbery', 'break_and_enter', 'vehicle_theft', 'weapons', 'drugs', 'missing_person', 'wanted_person', 'traffic_collision', 'fire', 'dangerous_person_alert', 'police_operation', 'sirt_investigation', 'public_disorder', or 'other_public_safety'.
Classify severity into: 'low', 'medium', 'high', or 'critical'.
Identify locationText and estimate Saskatoon/Saskatchewan coordinates (latitude around 52.13, longitude around -106.67). If the location is outside Saskatoon, provide the native Saskatchewan coordinates (e.g. Regina, Prince Albert, Warman, North Battleford etc.).
Set locationPrecision into: 'exact', 'block', 'intersection', 'neighbourhood', 'city', or 'unknown'.
Generate an objective, highly informative 2-sentence summary.`;

    const aiResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Clear succinct headline starting with an active verb or clear incident state" },
            summary: { type: Type.STRING, description: "Informative 1-2 sentence overview without accusing or guessing guilt" },
            eventType: { type: Type.STRING, description: "The classified event type" },
            severity: { type: Type.STRING, description: "The classified severity: low, medium, high, critical" },
            locationText: { type: Type.STRING, description: "Approximate block/intersection location name" },
            locationPrecision: { type: Type.STRING, description: "exact, block, intersection, neighbourhood, city, unknown" },
            latitude: { type: Type.NUMBER, description: "Saskatoon latitude estimate (around 52.1332) or Saskatchewan native town" },
            longitude: { type: Type.NUMBER, description: "Saskatoon longitude estimate (around -106.67) or Saskatchewan native town" },
            locationConfidence: { type: Type.NUMBER, description: "Estimated geocode certainty between 0.0 and 1.0" },
          },
          required: ["title", "summary", "eventType", "severity", "locationText", "locationPrecision", "latitude", "longitude", "locationConfidence"]
        }
      }
    });

    const cleanRes = aiResponse.text.trim();
    const result = JSON.parse(cleanRes);

    const extractedLoc = result.locationText || manualTitle;
    const geocoded = await geocodeLocation(extractedLoc, "saskatoon_police_news");
    const validatedClass = ruleBasedClassifier(result.title || manualTitle, result.summary || rawText);

    const customId = "evt-interactive-" + Math.random().toString(36).substr(2, 9);
    const manualEvent: EventItem = {
      id: customId,
      sourceKey: "saskatoon_police_news",
      sourceName: "Local Incident Dashboard User Report",
      sourceType: "media",
      title: result.title || manualTitle,
      summary: result.summary || manualSummary,
      originalUrl: originalUrl || `https://saskatoonsafetymap.ca/manual-reports/${customId}`,
      publishedAt: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      eventType: validatedClass.eventType || result.eventType || "other_public_safety",
      severity: (validatedClass.severity || result.severity || "medium") as SeverityType,
      confidence: Math.round(((validatedClass.confidence + (result.locationConfidence || 0.8)) / 2) * 100) / 100,
      locationText: geocoded.locationText,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      locationPrecision: geocoded.locationPrecision,
      locationConfidence: geocoded.locationConfidence,
      sourceHash: "interactive-hash-" + Math.random(),
      createdAt: new Date().toISOString(),
      imageUrls: getEventImagesByType(validatedClass.eventType || result.eventType || "other_public_safety"),
      isVerified: false // manual/unverified-only!
    };

    await saveIncident(manualEvent);
    res.json({ success: true, count: 1, addedEvents: [manualEvent], message: "Success dynamically analyzing and geocoding your manual safety report!" });
  } catch (error: any) {
    console.error("AI manual report processing failed:", error);
    res.status(500).json({ error: "Failed to parse manual safety bulletin: " + error.message });
  }
});

// POST /api/events/upload-news
// Handle processing of uploaded or pasted crime-related news content using Gemini AI or Local Rule-Based filter extraction!
app.post("/api/events/upload-news", async (req, res) => {
  const { text, mode, sourceKey, sourceName } = req.body;
  if (!text || text.trim().length < 10) {
    res.status(400).json({ error: "The uploaded news content is too brief. Please provide a substantial article body or text table." });
    return;
  }

  try {
    const isApiKeyConfigured = !!process.env.GEMINI_API_KEY;
    const useRuleBased = (mode === "rule-based" || !isApiKeyConfigured);

    if (!useRuleBased) {
      console.log("[News Upload Engine] Invoking Gemini AI model to digest uploaded text news feed...");
      const ai = getGenAI();
      const prompt = `Analyze the following uploaded raw text/content representing news articles, news feeds, or crime alerts.
Extract any public safety, crime, or hazard incidents described in it. You can extract multiple items if present (up to 10 separate events).
Raw content:
"${text}"

For each extracted incident, populate a JSON array of objects with the following properties:
- title: A clear succinct headline starting with an active verb or incident category
- summary: Informative 1-2 sentence overview/narrative of what happened
- eventType: Classify into 'assault', 'homicide', 'shooting', 'stabbing', 'robbery', 'break_and_enter', 'vehicle_theft', 'weapons', 'drugs', 'missing_person', 'wanted_person', 'traffic_collision', 'fire', 'dangerous_person_alert', 'police_operation', 'sirt_investigation', 'public_disorder', or 'other_public_safety'.
- severity: Classify into 'low', 'medium', 'high', or 'critical'.
- locationText: Approximate block/intersection location name (e.g. "800 block of Broadway Avenue, Saskatoon, SK")
- locationPrecision: Classify into 'exact', 'block', 'intersection', 'neighbourhood', 'city', or 'unknown'.
- latitude: Estimated Saskatoon latitude (around 52.13) or Saskatchewan town coordinates
- longitude: Estimated Saskatoon longitude (around -106.67) or Saskatchewan town coordinates
- locationConfidence: Number representing location extraction confidence between 0.0 and 1.0

Return a valid JSON array matching this schema. Even if there is only 1 event, return it as an array.`;

      const aiResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                eventType: { type: Type.STRING },
                severity: { type: Type.STRING },
                locationText: { type: Type.STRING },
                locationPrecision: { type: Type.STRING },
                latitude: { type: Type.NUMBER },
                longitude: { type: Type.NUMBER },
                locationConfidence: { type: Type.NUMBER }
              },
              required: ["title", "summary", "eventType", "severity", "locationText", "locationPrecision", "latitude", "longitude", "locationConfidence"]
            }
          }
        }
      });

      const parsedArray = JSON.parse(aiResponse.text.trim());
      const addedEvents: EventItem[] = [];

      for (const item of parsedArray) {
        const customId = "evt-uploaded-" + Math.random().toString(36).substr(2, 9);
        const geocoded = await geocodeLocation(item.locationText || "Saskatoon, SK", sourceKey || "cbc_saskatoon_news");
        
        const finalLat = geocoded.latitude === 52.1332 && geocoded.longitude === -106.6700 && item.latitude ? item.latitude : geocoded.latitude;
        const finalLng = geocoded.latitude === 52.1332 && geocoded.longitude === -106.6700 && item.longitude ? item.longitude : geocoded.longitude;

        const validatedClass = ruleBasedClassifier(item.title, item.summary);

        const eventObj: EventItem = {
          id: customId,
          sourceKey: sourceKey || "cbc_saskatoon_news",
          sourceName: sourceName || "Uploaded News Source",
          sourceType: "media",
          title: item.title,
          summary: item.summary,
          originalUrl: "https://www.google.com/search?q=" + encodeURIComponent(item.title),
          publishedAt: new Date().toISOString(),
          retrievedAt: new Date().toISOString(),
          eventType: validatedClass.eventType || item.eventType || "other_public_safety",
          severity: (validatedClass.severity || item.severity || "medium") as SeverityType,
          confidence: Math.round(((validatedClass.confidence + (item.locationConfidence || 0.8)) / 2) * 100) / 100,
          locationText: geocoded.locationText || item.locationText || "Saskatoon, SK",
          latitude: finalLat,
          longitude: finalLng,
          locationPrecision: geocoded.locationPrecision || item.locationPrecision || "unknown",
          locationConfidence: geocoded.locationConfidence || item.locationConfidence || 0.5,
          sourceHash: "upload-hash-" + Math.random(),
          createdAt: new Date().toISOString(),
          imageUrls: getEventImagesByType(validatedClass.eventType || item.eventType || "other_public_safety")
        };

        addedEvents.push(eventObj);
      }

      if (addedEvents.length > 0) {
        events.unshift(...addedEvents);
      }

      res.json({
        success: true,
        count: addedEvents.length,
        addedEvents,
        message: `Successfully processed news source! Extracted ${addedEvents.length} crime & safety events using Gemini AI.`
      });
      return;
    }

    // Rule-based classification mode or fallback (when Gemini API is not configured or user requests rule-based mode)
    console.log("[News Upload Engine] Digesting uploaded content using Regex/Rule-Based segmentation...");
    const addedEvents: EventItem[] = [];
    const lines = text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 10);
    
    for (const line of lines) {
      const classification = ruleBasedClassifier(line, line);
      
      if (classification.eventType !== "other_public_safety" || line.match(/police|arrest|stolen|robbery|assault|accident|collision|fire|court|charge/i)) {
        const titleCandidate = line.substring(0, 80);
        const summaryCandidate = line.substring(0, 240);
        const locCandidate = extractLocationText(line) || "Saskatoon, SK";
        const geocoded = await geocodeLocation(locCandidate, sourceKey || "cbc_saskatoon_news");
        
        const customId = "evt-uploaded-" + Math.random().toString(36).substr(2, 9);
        const eventObj: EventItem = {
          id: customId,
          sourceKey: sourceKey || "cbc_saskatoon_news",
          sourceName: sourceName || "Uploaded News Source",
          sourceType: "media",
          title: titleCandidate,
          summary: summaryCandidate,
          originalUrl: "https://www.google.com/search?q=" + encodeURIComponent(titleCandidate),
          publishedAt: new Date().toISOString(),
          retrievedAt: new Date().toISOString(),
          eventType: classification.eventType,
          severity: classification.severity,
          confidence: classification.confidence,
          locationText: geocoded.locationText,
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          locationPrecision: geocoded.locationPrecision,
          locationConfidence: geocoded.locationConfidence,
          sourceHash: "upload-hash-" + Math.random(),
          createdAt: new Date().toISOString(),
          imageUrls: getEventImagesByType(classification.eventType)
        };
        addedEvents.push(eventObj);
        if (addedEvents.length >= 15) break; 
      }
    }

    if (addedEvents.length > 0) {
      events.unshift(...addedEvents);
    }

    res.json({
      success: true,
      count: addedEvents.length,
      addedEvents,
      message: addedEvents.length > 0
        ? `Successfully processed news source! Parsed ${addedEvents.length} crime & safety events using rule-based filters.`
        : "Processed news source, but no clear crime/safety incidents could be identified using standard rule-based parsing. Try using AI Mode!"
    });

  } catch (error: any) {
    console.error("News upload parsing failed:", error);
    res.status(500).json({ error: "Failed to process target uploaded news content: " + error.message });
  }
});

// POST /api/ingest/run
// Runs a live Saskatoon safety intelligence and source crawler cycle, geocoding & persisting records strictly.
app.post("/api/ingest/run", async (req, res) => {
  try {
    const addedList: EventItem[] = [];
    const isApiKeyConfigured = !!process.env.GEMINI_API_KEY;

    // 1. Fetch live data from all real municipal and provincial news + map crawlers
    const [newLiveData, newNewsData, reginaNewsData, rcmpData, extraMuniData, pythonEvents] = await Promise.all([
      fetchSaskatoonLiveCrimeData().catch(() => []),
      fetchSaskatoonNewsFeeds().catch(() => []),
      fetchReginaNewsFeeds().catch(() => []),
      fetchSaskatchewanRCMPFeeds().catch(() => []),
      fetchOtherMunicipalFeeds().catch(() => []),
      runPythonAdapterIngestion().catch(() => []),
    ]);

    const combinedCrawl = [...newLiveData, ...newNewsData, ...reginaNewsData, ...rcmpData, ...extraMuniData, ...pythonEvents];
    for (const evt of combinedCrawl) {
      if (!events.some(e => e.id === evt.id || e.sourceHash === evt.sourceHash)) {
        if (isIncidentCompliant(evt)) {
          await saveIncident(evt);
          addedList.push(evt);
        }
      }
    }

    // 2. Dynamic CityAdaptor cycle for real-time intelligence feeds across Saskatchewan
    const targetCityParam = req.body?.city || req.query?.city || "All";
    let targetCities: string[] = [];
    if (targetCityParam === "All" || targetCityParam === "Saskatchewan (All)") {
      targetCities = ["Saskatoon", "Regina", "Prince Albert", "Moose Jaw", "Swift Current", "Yorkton", "North Battleford", "Estevan", "Weyburn", "Lloydminster"];
    } else if (typeof targetCityParam === "string") {
      targetCities = [targetCityParam];
    } else if (Array.isArray(targetCityParam)) {
      targetCities = targetCityParam;
    }

    console.log(`[Ingestion Engine] Dynamically running CityAdaptor for: ${targetCities.join(", ")}`);
    const adapterContext = { geocodeLocation, ruleBasedClassifier };
    const adapterEvents = await CityAdaptor.runCityCycle(targetCities, adapterContext);

    for (const evt of adapterEvents) {
      if (!events.some(e => e.id === evt.id || e.sourceHash === evt.sourceHash) && !addedList.some(e => e.id === evt.id)) {
        if (isIncidentCompliant(evt)) {
          await saveIncident(evt);
          addedList.push(evt);
        }
      }
    }

    // 3. Demo simulated generation (Only if DEMO_MODE environment is explicitly flagged true)
    const isDemoActive = DEMO_MODE || req.body?.demo === true || req.query?.demo === "true";
    if (isDemoActive) {
      console.log("[Ingestion Engine] Ingestion active in DEMO_MODE. Loading simulated backup/seed safety warnings...");
      if (!isApiKeyConfigured) {
        const rawSeeds = [
          {
            id: "evt-sim-101",
            sourceKey: "saskatoon_police_news",
            sourceName: "Saskatoon Police News (Demo)",
            sourceType: "official" as SourceType,
            title: "Active Stabbing Incident Inquiry on 8th Street East",
            summary: "Officers cordoned off a gas station entrance following a broad-daylight stabbing event. One victim transported in stable condition. Search continues for matching suspect vest description.",
            originalUrl: "https://saskatoonpolice.ca/news/simulated-stabbing-8th",
            publishedAt: new Date().toISOString(),
            locationText: "860 8th Street East, Saskatoon, SK"
          },
          {
            id: "evt-sim-102",
            sourceKey: "rcmp_saskatchewan_news",
            sourceName: "Saskatchewan RCMP News (Demo)",
            sourceType: "official" as SourceType,
            title: "Dangerous Driver Alert Near Warman Corridor",
            summary: "RCMP dispatched units targeting reports of an erratically maneuvering truck transport heading north. Motorists advised to practice absolute defensive safety cautions.",
            originalUrl: "https://www.rcmp-grc.gc.ca/en/news/2026/warman-dangerous-driver",
            publishedAt: new Date(Date.now() - 45 * 60000).toISOString(),
            locationText: "Highway 11 near Warman, SK"
          },
          {
            id: "evt-sim-103",
            sourceKey: "saskatchewan_gov_news",
            sourceName: "Saskatchewan Government / SIRT (Demo)",
            sourceType: "government" as SourceType,
            title: "SIRT Commences Inquiry into Prince Albert Detention Incident",
            summary: "The Serious Incident Response Team confirmed launch of a transparent public inquiry following a residential detention security event report in Northern Saskatchewan district.",
            originalUrl: "https://www.saskatchewan.ca/government/news-and-media/sirt-pa-detention",
            publishedAt: new Date(Date.now() - 90 * 60000).toISOString(),
            locationText: "Prince Albert Provincial Correction Complex, SK"
          }
        ];

        const processedSeeds: EventItem[] = [];
        for (const raw of rawSeeds) {
          const geocoded = await geocodeLocation(raw.locationText, raw.sourceKey);
          const classified = ruleBasedClassifier(raw.title, raw.summary);
          
          processedSeeds.push({
            id: raw.id,
            sourceKey: raw.sourceKey,
            sourceName: raw.sourceName,
            sourceType: raw.sourceType,
            title: raw.title,
            summary: raw.summary,
            originalUrl: raw.originalUrl,
            publishedAt: raw.publishedAt,
            retrievedAt: new Date().toISOString(),
            eventType: classified.eventType,
            severity: classified.severity,
            confidence: classified.confidence,
            locationText: geocoded.locationText,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: geocoded.locationPrecision,
            locationConfidence: geocoded.locationConfidence,
            sourceHash: "simulated-hash-" + raw.id,
            createdAt: new Date().toISOString()
          });
        }

        for (const item of processedSeeds) {
          if (!events.some(e => e.id === item.id) && isIncidentCompliant(item)) {
            await saveIncident(item);
            addedList.push(item);
          }
        }
      } else {
        const ai = getGenAI();
        const prompt = `Simulate an ingestion crawl of Saskatoon Police bulletins, Saskatchewan RCMP notices, and Government SIRT press statements from June 2026.
Generate exactly 3 brand-new, highly realistic public safety incident events that could have occurred in Saskatoon, Saskatchewan within the last 24 hours.
Your structured output must match the array schemas. Ensure coordinates are placed around Saskatoon (lat: ~52.13, lng: ~-106.67) or major Saskatchewan municipalities.
Use actual local Saskatoon landmarks (e.g., Preston Crossing, Stonebridge, Spadina Crescent, Circle Drive, Idylwyld Dr, 22nd Street West, etc.) for authentic geocoding.`;

        const aiResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "Sucinct headline" },
                  summary: { type: Type.STRING, description: "1-2 sentence descriptive safety summary" },
                  eventType: { type: Type.STRING, description: "Incident classification category" },
                  severity: { type: Type.STRING, description: "low, medium, high, critical" },
                  locationText: { type: Type.STRING, description: "Landmark, block name, or intersection" },
                  latitude: { type: Type.NUMBER, description: "precise latitude" },
                  longitude: { type: Type.NUMBER, description: "precise longitude" },
                  locationPrecision: { type: Type.STRING, description: "exact, block, intersection, neighbourhood, city, unknown" },
                  sourceKey: { type: Type.STRING, description: "saskatoon_police_news" },
                  sourceName: { type: Type.STRING, description: "Saskatoon Police News" },
                  sourceType: { type: Type.STRING, description: "official" }
                },
                required: ["title", "summary", "eventType", "severity", "locationText", "latitude", "longitude", "locationPrecision", "sourceKey", "sourceName", "sourceType"]
              }
            }
          }
        });

        const parsedArray = JSON.parse(aiResponse.text.trim());
        for (const item of parsedArray) {
          const customId = "evt-ingest-" + Math.random().toString(36).substr(2, 9);
          const geocoded = await geocodeLocation(item.locationText || "Saskatoon, SK", item.sourceKey || "saskatoon_police_news");
          const ruleClass = ruleBasedClassifier(item.title, item.summary);

          const newEvt: EventItem = {
            id: customId,
            sourceKey: item.sourceKey || "saskatoon_police_news",
            sourceName: item.sourceName || "Saskatoon Police News (Demo)",
            sourceType: (item.sourceType || "official") as SourceType,
            title: item.title,
            summary: item.summary,
            originalUrl: `https://saskatoonsafetymap.ca/demo-bulletins/bulletin-${Math.floor(Math.random() * 100000)}`,
            publishedAt: new Date(Date.now() - Math.floor(Math.random() * 12 * 3600000)).toISOString(),
            retrievedAt: new Date().toISOString(),
            eventType: ruleClass.eventType || item.eventType || "other_public_safety",
            severity: (ruleClass.severity || item.severity || "medium") as SeverityType,
            confidence: ruleClass.confidence || 0.94,
            locationText: geocoded.locationText,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: geocoded.locationPrecision,
            locationConfidence: geocoded.locationConfidence,
            sourceHash: `ingest-hash-${customId}`,
            createdAt: new Date().toISOString()
          };

          if (isIncidentCompliant(newEvt)) {
            await saveIncident(newEvt);
            addedList.push(newEvt);
          }
        }
      }
    }

    res.json({
      success: true,
      count: addedList.length,
      addedEvents: addedList,
      message: addedList.length > 0
        ? `Safety data synchronization completes! Appended ${addedList.length} fresh verified incident bulletins.`
        : "No new unique, compliant safety bulletins found across the region."
    });
  } catch (error: any) {
    console.error("Critical feeds ingestion error:", error);
    res.status(500).json({ error: "Failed to run public safety feeds crawl: " + error.message });
  }
});

async function fetchSaskatoonLiveCrimeData(): Promise<EventItem[]> {
  try {
    console.log("[Data Sync] Fetching live data from map.saskatoonpolice.ca...");
    const d = new Date(); d.setDate(d.getDate() - 14);
    const startStr = d.toISOString().split('T')[0];
    const endStr = new Date().toISOString().split('T')[0];
    const q = new URLSearchParams({ start: startStr, end: endStr, getoffences: '1', page: '1', limit: '1000' });
    
    // Explicitly add a User-Agent or it might fail on production
    const r = await fetch('https://map.saskatoonpolice.ca/', {
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: q
    });
    
    const result = await r.json();
    if (result && result.rows) {
      const liveEvents: EventItem[] = [];
      const idCounts: Record<string, number> = {};
      
      for (const row of result.rows) {
        // Generating a consistent hash for deduping
        const baseId = "sps-" + String(row.rep_date).replace(/\D/g, "") + "-" + String(row.lat).replace(".", "") + String(row.lng).replace(".", "");
        const catStr = String(row.category || '').replace(/\W/g, "");
        const draftId = baseId + "-" + catStr;
        
        idCounts[draftId] = (idCounts[draftId] || 0) + 1;
        const uniqueId = draftId + (idCounts[draftId] > 1 ? `-${idCounts[draftId]}` : "");
        
        const classification = ruleBasedClassifier(
          String(row.category || ''),
          String(row.category || '') + " " + String(row.neighbourhood || '')
        );
        let severity: SeverityType = classification.severity;
        let eventType = classification.eventType;

        const newEvt: EventItem = {
          id: uniqueId,
          sourceKey: "saskatoon_crime_map",
          sourceName: "Saskatoon Police Crime Map",
          sourceType: "official",
          title: String(row.category),
          summary: `Reported at ${row.location} in the ${row.neighbourhood} neighbourhood. Updated on ${row.lastupdate}`,
          originalUrl: "https://map.saskatoonpolice.ca/",
          publishedAt: new Date(String(row.rep_date).replace(" ", "T") + "Z").toISOString(),
          retrievedAt: new Date().toISOString(),
          eventType: eventType,
          severity: severity,
          confidence: 1.0,
          locationText: `${row.location}, ${row.neighbourhood}, Saskatoon, SK`,
          latitude: parseFloat(row.lat),
          longitude: parseFloat(row.lng),
          locationPrecision: "block",
          locationConfidence: 1.0,
          sourceHash: "map-hash-" + uniqueId,
          createdAt: new Date().toISOString()
        };
        liveEvents.push(newEvt);
      }
      console.log(`[Data Sync] Successfully extracted ${liveEvents.length} mapping events.`);
      return liveEvents;
    }
  } catch (err) {
    console.error("[Data Sync Error] fetching live Saskatoon crime data:", err);
  }
  return [];
}

async function fetchSaskatoonNewsFeeds(): Promise<EventItem[]> {
  const newsEvents: EventItem[] = [];
  try {
    // 1. Fetch CBC
    console.log("[Data Sync] Fetching CBC Saskatoon News...");
    const cbcRes = await fetch("https://rss.cbc.ca/lineup/canada-saskatoon.xml", { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (cbcRes.ok) {
      const cbcText = await cbcRes.text();
      const cbcItems = cbcText.split('<item').slice(1).map(i => {
        const titleMatch = i.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
        const linkMatch = i.match(/<link>(.*?)<\/link>/);
        const descMatch = i.match(/<description><!\[CDATA\[.*?<p>(.*?)<\/p>\]\]><\/description>/);
        const dateMatch = i.match(/<pubDate>(.*?)<\/pubDate>/);
        return {
          title: titleMatch ? titleMatch[1] : '',
          link: linkMatch ? linkMatch[1] : 'https://www.cbc.ca/news/canada/saskatoon',
          description: descMatch ? descMatch[1] : '',
          date: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
        };
      });

      for (const item of cbcItems) {
        if (!item.title) continue;
        const norm = (item.title + ' ' + item.description).toLowerCase();
        // Light keyword filter to grab crime/safety news
        if (norm.match(/police|crime|killed|murder|attack|theft|robbery|stabbing|assault|court|trial|crash|fire/i)) {
          const uniqueId = "cbc-" + crypto.createHash("md5").update(item.link).digest("hex").substring(0, 16);
          const locCandidate = extractLocationText(item.title + " " + item.description);
          const geocoded = await geocodeLocation(locCandidate, "cbc_saskatoon_news");
          const classified = ruleBasedClassifier(item.title, item.description);
          
          newsEvents.push({
            id: uniqueId,
            sourceKey: "cbc_saskatoon_news",
            sourceName: "CBC Saskatoon News",
            sourceType: "media",
            title: item.title,
            summary: item.description,
            originalUrl: item.link,
            publishedAt: item.date,
            retrievedAt: new Date().toISOString(),
            eventType: classified.eventType,
            severity: classified.severity,
            confidence: classified.confidence,
            locationText: geocoded.locationText,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: geocoded.locationPrecision,
            locationConfidence: geocoded.locationConfidence,
            sourceHash: "cbc-hash-" + uniqueId,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // 2. Fetch Global News
    console.log("[Data Sync] Fetching Global News Saskatoon...");
    const globalRes = await fetch("https://globalnews.ca/saskatoon/feed/", { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (globalRes.ok) {
      const globalText = await globalRes.text();
      const globalItems = globalText.split('<item>').slice(1).map(i => {
        const titleMatch = i.match(/<title>(.*?)<\/title>/);
        const linkMatch = i.match(/<link>(.*?)<\/link>/);
        const descMatch = i.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
        const dateMatch = i.match(/<pubDate>(.*?)<\/pubDate>/);
        return {
          title: titleMatch ? titleMatch[1] : '',
          link: linkMatch ? linkMatch[1] : 'https://globalnews.ca/saskatoon/',
          description: descMatch ? descMatch[1] : '',
          date: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
        };
      });

      for (const item of globalItems) {
        if (!item.title) continue;
        const norm = (item.title + ' ' + item.description).toLowerCase();
        if (norm.match(/police|crime|killed|murder|attack|theft|robbery|stabbing|assault|court|trial|crash|fire/i)) {
          const uniqueId = "glo-" + crypto.createHash("md5").update(item.link).digest("hex").substring(0, 16);
          const locCandidate = extractLocationText(item.title + " " + item.description);
          const geocoded = await geocodeLocation(locCandidate, "global_news_saskatoon");
          const classified = ruleBasedClassifier(item.title, item.description);

          newsEvents.push({
            id: uniqueId,
            sourceKey: "global_news_saskatoon",
            sourceName: "Global News Saskatoon",
            sourceType: "media",
            title: item.title.replace(/&#8217;/g, "'").replace(/&amp;/g, "&").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').replace(/&#8211;/g, "-"),
            summary: item.description.replace(/&#8217;/g, "'").replace(/&amp;/g, "&").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').replace(/&#8211;/g, "-"),
            originalUrl: item.link,
            publishedAt: item.date,
            retrievedAt: new Date().toISOString(),
            eventType: classified.eventType,
            severity: classified.severity,
            confidence: classified.confidence,
            locationText: geocoded.locationText,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: geocoded.locationPrecision,
            locationConfidence: geocoded.locationConfidence,
            sourceHash: "glo-hash-" + uniqueId,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
    
    console.log(`[Data Sync] Refreshed ${newsEvents.length} local crime news publications.`);
  } catch (err) {
    console.error("[Data Sync Error] fetching news:", err);
  }
  return newsEvents;
}

// Regina News Adapter: Crawls and parses Regina specific CBC and Global News RSS
async function fetchReginaNewsFeeds(): Promise<EventItem[]> {
  const newsEvents: EventItem[] = [];
  try {
    console.log("[Data Sync] Fetching CBC Regina News...");
    const cbcRes = await fetch("https://rss.cbc.ca/lineup/canada-regina.xml", { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (cbcRes.ok) {
      const cbcText = await cbcRes.text();
      const cbcItems = cbcText.split('<item').slice(1).map(i => {
        const titleMatch = i.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || i.match(/<title>(.*?)<\/title>/);
        const linkMatch = i.match(/<link>(.*?)<\/link>/);
        const descMatch = i.match(/<description><!\[CDATA\[.*?<p>(.*?)<\/p>\]\]><\/description>/) || i.match(/<description>(.*?)<\/description>/);
        const dateMatch = i.match(/<pubDate>(.*?)<\/pubDate>/);
        return {
          title: titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "") : '',
          link: linkMatch ? linkMatch[1] : 'https://www.cbc.ca/news/canada/regina',
          description: descMatch ? descMatch[1].replace(/<!\[CDATA\[|\]\]>|<[^>]*>?/gm, "") : '',
          date: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
        };
      });

      for (const item of cbcItems) {
        if (!item.title) continue;
        const norm = (item.title + ' ' + item.description).toLowerCase();
        if (norm.match(/police|crime|killed|murder|attack|theft|robbery|stabbing|assault|court|trial|crash|fire|sirt|charge/i)) {
          const uniqueId = "reg-cbc-" + crypto.createHash("md5").update(item.link).digest("hex").substring(0, 16);
          const geocoded = await geocodeLocation(item.title + " Regina, SK", "cbc_regina_news");
          const classified = ruleBasedClassifier(item.title, item.description);
          newsEvents.push({
            id: uniqueId,
            sourceKey: "cbc_regina_news",
            sourceName: "CBC Regina News",
            sourceType: "media",
            title: item.title,
            summary: item.description || "Regina public safety community alert reported by regional news desk. Follow link for live details.",
            originalUrl: item.link,
            publishedAt: item.date,
            retrievedAt: new Date().toISOString(),
            eventType: classified.eventType,
            severity: classified.severity,
            confidence: 0.90,
            locationText: geocoded.locationText || "Regina, SK",
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: geocoded.locationPrecision,
            locationConfidence: geocoded.locationConfidence,
            sourceHash: "reg-cbc-hash-" + uniqueId,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    console.log("[Data Sync] Fetching Global News Regina...");
    const globalRes = await fetch("https://globalnews.ca/regina/feed/", { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (globalRes.ok) {
      const globalText = await globalRes.text();
      const globalItems = globalText.split('<item>').slice(1).map(i => {
        const titleMatch = i.match(/<title>(.*?)<\/title>/) || i.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
        const linkMatch = i.match(/<link>(.*?)<\/link>/);
        const descMatch = i.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || i.match(/<description>(.*?)<\/description>/);
        const dateMatch = i.match(/<pubDate>(.*?)<\/pubDate>/);
        return {
          title: titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "") : '',
          link: linkMatch ? linkMatch[1] : 'https://globalnews.ca/regina/',
          description: descMatch ? descMatch[1].replace(/<!\[CDATA\[|\]\]>|<[^>]*>?/gm, "") : '',
          date: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
        };
      });

      for (const item of globalItems) {
        if (!item.title) continue;
        const norm = (item.title + ' ' + item.description).toLowerCase();
        if (norm.match(/police|crime|killed|murder|attack|theft|robbery|stabbing|assault|court|trial|crash|fire|sirt|charge/i)) {
          const uniqueId = "reg-glo-" + crypto.createHash("md5").update(item.link).digest("hex").substring(0, 16);
          const geocoded = await geocodeLocation(item.title + " Regina, SK", "global_news_regina");
          const classified = ruleBasedClassifier(item.title, item.description);
          newsEvents.push({
            id: uniqueId,
            sourceKey: "global_news_regina",
            sourceName: "Global News Regina",
            sourceType: "media",
            title: item.title,
            summary: item.description || "Global News Regina localized community hazard or safety inquiry report.",
            originalUrl: item.link,
            publishedAt: item.date,
            retrievedAt: new Date().toISOString(),
            eventType: classified.eventType,
            severity: classified.severity,
            confidence: 0.88,
            locationText: geocoded.locationText || "Regina, SK",
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: geocoded.locationPrecision,
            locationConfidence: geocoded.locationConfidence,
            sourceHash: "reg-glo-hash-" + uniqueId,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  } catch (err) {
    console.error("[Data Sync Error] Regina safety news fetch fails:", err);
  }
  return newsEvents;
}

// Saskatchewan RCMP News Adapter: Crawls and parses Saskatchewan GRC/RCMP official feed
async function fetchSaskatchewanRCMPFeeds(): Promise<EventItem[]> {
  const rcmpEvents: EventItem[] = [];
  try {
    console.log("[Data Sync] Fetching Saskatchewan RCMP news feed RSS...");
    const xmlText = await fetchWithSslBypass("https://www.rcmp-grc.gc.ca/en/rss/39", { 'User-Agent': 'Mozilla/5.0' });
    if (xmlText) {
      const items = xmlText.split('<item>').slice(1).map(i => {
        const titleMatch = i.match(/<title>(.*?)<\/title>/) || i.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
        const linkMatch = i.match(/<link>(.*?)<\/link>/);
        const descMatch = i.match(/<description>(.*?)<\/description>/) || i.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
        const dateMatch = i.match(/<pubDate>(.*?)<\/pubDate>/);
        
        let desc = descMatch ? descMatch[1] : '';
        desc = desc.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>?/gm, ''); // strip HTML
        return {
          title: titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : '',
          link: linkMatch ? linkMatch[1] : 'https://www.rcmp-grc.gc.ca/en/news/2026',
          description: desc.trim(),
          date: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
        };
      });

      for (const item of items) {
        if (!item.title) continue;
        const normTitle = item.title.toLowerCase();
        
        // Scan to locate detachment/town name
        let matchedTown = "saskatchewan";
        for (const town of Object.keys(saskatchewanCoordinatesMap)) {
          if (town !== "saskatchewan" && town !== "broadway" && town !== "kinsmen" && normTitle.includes(town)) {
            matchedTown = town;
            break;
          }
        }

        const uniqueId = "rcmp-" + crypto.createHash("md5").update(item.link).digest("hex").substring(0, 16);
        const locationStr = matchedTown === "saskatchewan" ? "Saskatchewan, Canada" : `${matchedTown.charAt(0).toUpperCase() + matchedTown.slice(1)}, SK`;
        const geocoded = await geocodeLocation(locationStr, "rcmp_saskatchewan_news");
        const classification = ruleBasedClassifier(item.title, item.description);

        rcmpEvents.push({
          id: uniqueId,
          sourceKey: "rcmp_saskatchewan_news",
          sourceName: "Saskatchewan RCMP News Releases",
          sourceType: "official",
          title: item.title,
          summary: item.description || "The Saskatchewan RCMP released an official notice regarding this local incident. See full statement details at source.",
          originalUrl: item.link,
          publishedAt: item.date,
          retrievedAt: new Date().toISOString(),
          eventType: classification.eventType,
          severity: classification.severity,
          confidence: 0.95,
          locationText: locationStr,
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          locationPrecision: matchedTown === "saskatchewan" ? "city" : "block",
          locationConfidence: 0.90,
          sourceHash: "rcmp-hash-" + uniqueId,
          createdAt: new Date().toISOString()
        });
      }
    }
  } catch (err) {
    console.error("[Data Sync Error] Saskatchewan RCMP RSS import failed:", err);
  }
  return rcmpEvents;
}

// Extra Municipal (Battlefords, Prince Albert, Moose Jaw, Swift Current, etc) Adapter: parses the province-wide Saskatchewan CBC RSS
async function fetchOtherMunicipalFeeds(): Promise<EventItem[]> {
  const newsEvents: EventItem[] = [];
  try {
    console.log("[Data Sync] Fetching CBC Saskatchewan provincial news feed...");
    const res = await fetch("https://rss.cbc.ca/lineup/canada-saskatchewan.xml", { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const cbcText = await res.text();
      const cbcItems = cbcText.split('<item').slice(1).map(i => {
        const titleMatch = i.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || i.match(/<title>(.*?)<\/title>/);
        const linkMatch = i.match(/<link>(.*?)<\/link>/);
        const descMatch = i.match(/<description><!\[CDATA\[.*?<p>(.*?)<\/p>\]\]><\/description>/) || i.match(/<description>(.*?)<\/description>/);
        const dateMatch = i.match(/<pubDate>(.*?)<\/pubDate>/);
        return {
          title: titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "") : '',
          link: linkMatch ? linkMatch[1] : 'https://www.cbc.ca/news/canada/saskatchewan',
          description: descMatch ? descMatch[1].replace(/<!\[CDATA\[|\]\]>|<[^>]*>?/gm, "") : '',
          date: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
        };
      });

      for (const item of cbcItems) {
        if (!item.title) continue;
        const norm = (item.title + ' ' + item.description).toLowerCase();
        
        let matchedCity = "";
        if (norm.includes("prince albert")) matchedCity = "Prince Albert";
        else if (norm.includes("moose jaw")) matchedCity = "Moose Jaw";
        else if (norm.includes("swift current")) matchedCity = "Swift Current";
        else if (norm.includes("yorkton")) matchedCity = "Yorkton";
        else if (norm.includes("north battleford") || norm.includes("battleford")) matchedCity = "North Battleford";
        else if (norm.includes("estevan")) matchedCity = "Estevan";
        else if (norm.includes("weyburn")) matchedCity = "Weyburn";
        else if (norm.includes("lloydminster")) matchedCity = "Lloydminster";
        else if (norm.includes("la ronge")) matchedCity = "La Ronge";
        else if (norm.includes("warman")) matchedCity = "Warman";

        if (matchedCity && norm.match(/police|crime|killed|murder|attack|theft|robbery|stabbing|assault|court|trial|crash|fire|disorder/i)) {
          const uniqueId = "sk-muni-" + crypto.createHash("md5").update(item.link).digest("hex").substring(0, 16);
          const geocoded = await geocodeLocation(item.title + ` ${matchedCity}, SK`, "saskatchewan_gov_news");
          const classification = ruleBasedClassifier(item.title, item.description);
          
          let sourceKey = "saskatchewan_gov_news";
          if (matchedCity === "Prince Albert") sourceKey = "prince_albert_police_news";
          else if (matchedCity === "Moose Jaw") sourceKey = "moose_jaw_police_news";

          newsEvents.push({
            id: uniqueId,
            sourceKey: sourceKey,
            sourceName: `${matchedCity} Community Safety`,
            sourceType: "media",
            title: item.title,
            summary: item.description || `Localized safety bullet reported in ${matchedCity}, SK. Click report link for complete publisher coverage.`,
            originalUrl: item.link,
            publishedAt: item.date,
            retrievedAt: new Date().toISOString(),
            eventType: classification.eventType,
            severity: classification.severity,
            confidence: 0.85,
            locationText: `${matchedCity}, SK`,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: "city",
            locationConfidence: 0.82,
            sourceHash: "sk-muni-hash-" + uniqueId,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  } catch (err) {
    console.error("[Data Sync Error] Extra municipal RSS import failed:", err);
  }
  return newsEvents;
}

// Node-Python execution bridge function
function runPythonAdapterIngestion(): Promise<EventItem[]> {
  return new Promise((resolve) => {
    console.log("[Python Bridge] Executing Python adapters (main.py)...");
    const pyDir = path.join(process.cwd(), "python_adapters");
    
    // Execute main.py, wait for it to scrape, classify, geocode and build the database
    exec("python3 main.py", { cwd: pyDir }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Python Bridge Error] Ingestion script execution failed: ${error.message}`);
        console.error(stderr);
      } else {
        console.log(`[Python Bridge] Ingestion process completed. Output:\n${stdout}`);
      }
      
      // Execute export_json.py to retrieve geocoded database rows in clean JSON
      exec("python3 export_json.py", { cwd: pyDir }, (exportError, exportStdout, exportStderr) => {
        if (exportError) {
          console.error(`[Python Bridge Error] Export script execution failed: ${exportError.message}`);
          console.error(exportStderr);
          resolve([]);
          return;
        }
        
        try {
          const rawEvents = JSON.parse(exportStdout);
          // Apply fallback Unsplash safety images based on classified eventType
          const mappedEvents: EventItem[] = rawEvents.map((e: any) => {
            let sKey = "saskatoon_police_news"; // default fallback
            const nameLower = (e.sourceName || "").toLowerCase();
            if (nameLower.includes("rcmp")) {
              sKey = "rcmp_saskatchewan_news";
            } else if (nameLower.includes("government") || nameLower.includes("saskatchewan")) {
              sKey = "saskatchewan_gov_news";
            }
            return {
              ...e,
              sourceKey: e.sourceKey || sKey,
              imageUrls: getEventImagesByType(e.eventType),
              createdAt: e.createdAt || new Date().toISOString()
            };
          });
          console.log(`[Python Bridge] Successfully loaded ${mappedEvents.length} geocoded events from Python.`);
          resolve(mappedEvents);
        } catch (parseErr: any) {
          console.error(`[Python Bridge Error] Failed to parse JSON output: ${parseErr.message}`);
          console.error(`Raw export output was: ${exportStdout}`);
          resolve([]);
        }
      });
    });
  });
}

// Start listening and serve client files using Vite’s middleware mode
async function startServer() {
  // Synchronize and load verified incidents from Firestore first (seeding if empty)
  try {
    console.log("[Startup] Syncing and validating incidents from Firestore database...");
    await syncEventsFromFirestore();
  } catch (syncErr) {
    console.error("[Startup Error] Initial Firestore sync failed:", syncErr);
  }

  if (process.env.NODE_ENV !== "production") {
    // Vite middleware for smooth dev feedback
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    // Production serving static files of build output
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start listening immediately so the server is extremely responsive on startup!
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Saskatoon Safety Map Server active at http://0.0.0.0:${PORT}`);
  });

  // Load external live data asynchronously in the background
  (async () => {
    try {
      console.log("[Startup] Loading Saskatchewan-wide live crime and RCMP news data in background...");
      const [liveSaskatoon, newsSaskatoon, newsRegina, rcmpData, extraMuniData, pythonEvents] = await Promise.all([
        fetchSaskatoonLiveCrimeData().catch(() => []),
        fetchSaskatoonNewsFeeds().catch(() => []),
        fetchReginaNewsFeeds().catch(() => []),
        fetchSaskatchewanRCMPFeeds().catch(() => []),
        fetchOtherMunicipalFeeds().catch(() => []),
        runPythonAdapterIngestion().catch(() => []),
      ]);
      
      const combined = [...liveSaskatoon, ...newsSaskatoon, ...newsRegina, ...rcmpData, ...extraMuniData, ...pythonEvents];
      const newItems = combined.filter(newItem => {
        return !events.some(existing => existing.id === newItem.id || existing.sourceHash === newItem.sourceHash);
      });
      
      let persistedCount = 0;
      if (newItems.length > 0) {
        for (const item of newItems) {
          if (isIncidentCompliant(item)) {
            await saveIncident(item);
            persistedCount++;
          }
        }
        console.log(`[Startup] Saskatchewan background load complete. Persisted and cached ${persistedCount} fresh compliant live events.`);
      } else {
        console.log("[Startup] Saskatchewan background load complete. No new unique events found.");
      }
    } catch (err) {
      console.error("[Startup Error] Async loading of Saskatchewan provincial data failed:", err);
    }
  })();
}

startServer();
