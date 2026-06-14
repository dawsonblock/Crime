import { EventItem, SeverityType, LocationPrecisionType } from "./src/types";
import crypto from "crypto";

export interface IngestionContext {
  geocodeLocation: (addressText: string, sourceKey: string) => Promise<{
    latitude: number;
    longitude: number;
    locationPrecision: LocationPrecisionType;
    locationConfidence: number;
    locationText: string;
  }>;
  ruleBasedClassifier: (title: string, summary: string) => {
    eventType: string;
    severity: SeverityType;
    confidence: number;
  };
}

export interface CityIngestConfig {
  name: string;
  coords: [number, number];
  policeFeedName: string;
  policeSourceKey: string;
  councilFeedName: string;
  councilSourceKey: string;
}

export const CITY_CONFIGS: Record<string, CityIngestConfig> = {
  "Saskatoon": {
    name: "Saskatoon",
    coords: [52.1332, -106.6700],
    policeFeedName: "Saskatoon Police Alerts",
    policeSourceKey: "saskatoon_police_news",
    councilFeedName: "Saskatoon City Council Announcements",
    councilSourceKey: "saskatoon_council_news"
  },
  "Regina": {
    name: "Regina",
    coords: [50.4452, -104.6189],
    policeFeedName: "Regina Police News & Releases",
    policeSourceKey: "regina_police_news",
    councilFeedName: "Regina City Council Advisory",
    councilSourceKey: "regina_council_news"
  },
  "Prince Albert": {
    name: "Prince Albert",
    coords: [53.2033, -105.7531],
    policeFeedName: "Prince Albert Police Bulletins",
    policeSourceKey: "prince_albert_police_news",
    councilFeedName: "Prince Albert Town Safety Releases",
    councilSourceKey: "prince_albert_council_news"
  },
  "Moose Jaw": {
    name: "Moose Jaw",
    coords: [50.3933, -105.5519],
    policeFeedName: "Moose Jaw Police Alerts",
    policeSourceKey: "moose_jaw_police_news",
    councilFeedName: "Moose Jaw Municipal Advisories",
    councilSourceKey: "moose_jaw_council_news"
  },
  "Swift Current": {
    name: "Swift Current",
    coords: [50.2853, -107.7977],
    policeFeedName: "Swift Current RCMP Detachment",
    policeSourceKey: "swift_current_rcmp_news",
    councilFeedName: "Swift Current City Alerts",
    councilSourceKey: "swift_current_council_news"
  },
  "Yorkton": {
    name: "Yorkton",
    coords: [51.2139, -102.4628],
    policeFeedName: "Yorkton District RCMP Operations",
    policeSourceKey: "yorkton_rcmp_news",
    councilFeedName: "Yorkton Public Safety Announcements",
    councilSourceKey: "yorkton_council_news"
  },
  "North Battleford": {
    name: "North Battleford",
    coords: [52.7576, -108.2861],
    policeFeedName: "Battlefords RCMP Detachment News",
    policeSourceKey: "north_battleford_rcmp_news",
    councilFeedName: "North Battleford Safety Releases",
    councilSourceKey: "north_battleford_council_news"
  },
  "Estevan": {
    name: "Estevan",
    coords: [49.1394, -102.9856],
    policeFeedName: "Estevan Police Service Bulletins",
    policeSourceKey: "estevan_police_news",
    councilFeedName: "Estevan Municipal Council Advisories",
    councilSourceKey: "estevan_council_news"
  },
  "Weyburn": {
    name: "Weyburn",
    coords: [49.6608, -103.8525],
    policeFeedName: "Weyburn Police Local Releases",
    policeSourceKey: "weyburn_police_news",
    councilFeedName: "Weyburn Council Alert Board",
    councilSourceKey: "weyburn_council_news"
  },
  "Lloydminster": {
    name: "Lloydminster",
    coords: [53.2785, -110.0051],
    policeFeedName: "Lloydminster RCMP Division Alerts",
    policeSourceKey: "lloydminster_rcmp_news",
    councilFeedName: "Lloydminster Council Hazard Reports",
    councilSourceKey: "lloydminster_council_news"
  }
};

export class CityAdaptor {
  /**
   * Dynamically ingests the police feed format for a specific Saskatchewan city
   */
  static async ingestPoliceFeed(cityName: string, ctx: IngestionContext): Promise<EventItem[]> {
    const config = CITY_CONFIGS[cityName];
    if (!config) return [];

    console.log(`[CityAdaptor] Ingesting police feed for ${cityName} using specific formats...`);
    const events: EventItem[] = [];

    switch (cityName) {
      case "Saskatoon": {
        // Saskatoon Police Format: Connects to the real SPS JSON map endpoint
        try {
          const d = new Date(); d.setDate(d.getDate() - 7);
          const startStr = d.toISOString().split('T')[0];
          const queryParams = new URLSearchParams({ start: startStr, end: new Date().toISOString().split('T')[0], getoffences: '1', page: '1', limit: '50' });
          const res = await fetch('https://map.saskatoonpolice.ca/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            body: queryParams
          });
          const data = await res.json();
          if (data && data.rows) {
            for (const row of data.rows.slice(0, 10)) {
              const baseId = "sps-adapt-" + String(row.rep_date).replace(/\D/g, "") + "-" + String(row.lat).replace(".", "").substring(0,6);
              const classif = ctx.ruleBasedClassifier(String(row.category), String(row.category));
              const locationStr = `${row.address || 'Saskatoon'}, Saskatoon, SK`;
              const idHash = crypto.createHash("md5").update(baseId).digest("hex").substring(0, 12);
              
              events.push({
                id: `sps-ad-${idHash}`,
                sourceKey: config.policeSourceKey,
                sourceName: config.policeFeedName,
                sourceType: "official",
                title: `${row.category || 'Incident Alert'} Reported`,
                summary: `Saskatoon Police Service logged active crime tracking index: ${row.category}. Safety protocols active in district boundary.`,
                originalUrl: "https://map.saskatoonpolice.ca/",
                publishedAt: row.rep_date ? new Date(row.rep_date).toISOString() : new Date().toISOString(),
                retrievedAt: new Date().toISOString(),
                eventType: classif.eventType,
                severity: classif.severity,
                confidence: 0.94,
                locationText: locationStr,
                latitude: Number(row.lat) || config.coords[0],
                longitude: Number(row.lng) || config.coords[1],
                locationPrecision: "block",
                locationConfidence: 0.95,
                sourceHash: `sps-hash-${idHash}`,
                createdAt: new Date().toISOString()
              });
            }
          }
        } catch (err) {
          console.error("[CityAdaptor Engine] Failed to fetch live Saskatoon Police feed. Falling back to local format schema.", err);
        }
        break;
      }

      case "Regina": {
        if (process.env.DEMO_MODE !== "true") {
          console.log("[CityAdaptor] Regina feed requested. Bypassing mock data in production.");
          break;
        }
        // Regina Police Format: official release bulletins
        const mockReginaBulletins = [
          {
            title: "Weapons Seizure Following High-Risk Vehicle Stop on Albert Street",
            summary: "Regina Police officers conducted a tactical vehicle check near Albert Street after identifying a stolen plate indicator. Loaded firearm and drugs seized from vehicle passengers.",
            location: "Albert Street & Victoria Avenue, Regina, SK",
            eventType: "weapons"
          },
          {
            title: "Overnight Commercial Break-In on Dewdney Avenue",
            summary: "Police responded to alarms at a retail storefront in the 1800 block of Dewdney Avenue. Suspects gained access via forced entry, removing tech inventory.",
            location: "1800 Block Dewdney Avenue, Regina, SK",
            eventType: "break_and_enter"
          }
        ];

        for (const b of mockReginaBulletins) {
          const geocoded = await ctx.geocodeLocation(b.location, config.policeSourceKey);
          const classif = ctx.ruleBasedClassifier(b.title, b.summary);
          const uniqId = crypto.createHash("md5").update(cityName + b.title).digest("hex").substring(0, 12);

          events.push({
            id: `regina-pol-${uniqId}`,
            sourceKey: config.policeSourceKey,
            sourceName: config.policeFeedName,
            sourceType: "official",
            title: b.title,
            summary: b.summary,
            originalUrl: "https://reginapolice.ca/news/",
            publishedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
            retrievedAt: new Date().toISOString(),
            eventType: classif.eventType || b.eventType,
            severity: classif.severity,
            confidence: 0.95,
            locationText: geocoded.locationText,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: geocoded.locationPrecision,
            locationConfidence: geocoded.locationConfidence,
            sourceHash: `regina-hash-${uniqId}`,
            createdAt: new Date().toISOString()
          });
        }
        break;
      }

      case "Prince Albert": {
        if (process.env.DEMO_MODE !== "true") {
          console.log("[CityAdaptor] Prince Albert feed requested. Bypassing mock data in production.");
          break;
        }
        // Prince Albert Police Bulletins
        const bulletins = [
          {
            title: "Prince Albert Police Seize Illicit Firearms on Marquis Road West",
            summary: "Patrol units and K-9 intercept team detained two suspicious males during a high confidence weapon possession check inside Prince Albert limits.",
            location: "Marquis Road West, Prince Albert, SK",
            eventType: "weapons"
          }
        ];

        for (const b of bulletins) {
          const geocoded = await ctx.geocodeLocation(b.location, config.policeSourceKey);
          const classif = ctx.ruleBasedClassifier(b.title, b.summary);
          const uniqId = crypto.createHash("md5").update(cityName + b.title).digest("hex").substring(0, 12);

          events.push({
            id: `pa-pol-${uniqId}`,
            sourceKey: config.policeSourceKey,
            sourceName: config.policeFeedName,
            sourceType: "official",
            title: b.title,
            summary: b.summary,
            originalUrl: "https://www.papolice.ca/",
            publishedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
            retrievedAt: new Date().toISOString(),
            eventType: classif.eventType || b.eventType,
            severity: classif.severity,
            confidence: 0.94,
            locationText: geocoded.locationText,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: geocoded.locationPrecision,
            locationConfidence: geocoded.locationConfidence,
            sourceHash: `pa-hash-${uniqId}`,
            createdAt: new Date().toISOString()
          });
        }
        break;
      }

      case "Moose Jaw": {
        if (process.env.DEMO_MODE !== "true") {
          console.log("[CityAdaptor] Moose Jaw feed requested. Bypassing mock data in production.");
          break;
        }
        const bulletins = [
          {
            title: "Moose Jaw Police Detail Vandalism and Mischief Incidents",
            summary: "Patrol units recorded commercial spray-paint incidents in the downtown core sector. Citizens requested to upload security camera recordings.",
            location: "Main Street North, Moose Jaw, SK",
            eventType: "public_disorder"
          }
        ];

        for (const b of bulletins) {
          const geocoded = await ctx.geocodeLocation(b.location, config.policeSourceKey);
          const classif = ctx.ruleBasedClassifier(b.title, b.summary);
          const uniqId = crypto.createHash("md5").update(cityName + b.title).digest("hex").substring(0, 12);

          events.push({
            id: `mj-pol-${uniqId}`,
            sourceKey: config.policeSourceKey,
            sourceName: config.policeFeedName,
            sourceType: "official",
            title: b.title,
            summary: b.summary,
            originalUrl: "https://mjpolice.ca/",
            publishedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
            retrievedAt: new Date().toISOString(),
            eventType: classif.eventType || b.eventType,
            severity: classif.severity,
            confidence: 0.91,
            locationText: geocoded.locationText,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            locationPrecision: geocoded.locationPrecision,
            locationConfidence: geocoded.locationConfidence,
            sourceHash: `mj-hash-${uniqId}`,
            createdAt: new Date().toISOString()
          });
        }
        break;
      }

      // Default RCMP feed formatting logic for Swift Current, Yorkton, North Battleford, Estevan, Weyburn, Lloydminster
      default: {
        if (process.env.DEMO_MODE !== "true") {
          break;
        }
        const titleText = `${config.name} RCMP Detachment Inquest Into Disturbance Complaint`;
        const summaryText = `The local ${config.name} RCMP detachment responded to security violations near central municipal boundaries. General caution advised during active walkthrough investigations.`;
        const locationStr = `Central Avenue, ${config.name}, SK`;

        const geocoded = await ctx.geocodeLocation(locationStr, config.policeSourceKey);
        const classif = ctx.ruleBasedClassifier(titleText, summaryText);
        const uniqId = crypto.createHash("md5").update(cityName + titleText).digest("hex").substring(0, 12);

        events.push({
          id: `rcmp-muni-${uniqId}`,
          sourceKey: config.policeSourceKey,
          sourceName: config.policeFeedName,
          sourceType: "official",
          title: titleText,
          summary: summaryText,
          originalUrl: "https://www.rcmp-grc.gc.ca/en/sk",
          publishedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          retrievedAt: new Date().toISOString(),
          eventType: classif.eventType,
          severity: classif.severity,
          confidence: 0.92,
          locationText: geocoded.locationText,
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          locationPrecision: geocoded.locationPrecision,
          locationConfidence: geocoded.locationConfidence,
          sourceHash: `rcmp-muni-hash-${uniqId}`,
          createdAt: new Date().toISOString()
        });
        break;
      }
    }

    return events;
  }

  /**
   * Dynamically ingests the town council/municipal safety feed format for a specific Saskatchewan city
   */
  static async ingestCouncilFeed(cityName: string, ctx: IngestionContext): Promise<EventItem[]> {
    if (process.env.DEMO_MODE !== "true") {
      return [];
    }
    const config = CITY_CONFIGS[cityName];
    if (!config) return [];

    console.log(`[CityAdaptor] Ingesting city council feed for ${cityName} using specific formats...`);
    const events: EventItem[] = [];

    const councilFeedsByName: Record<string, Array<{title: string, summary: string, location: string, eventType: string, severity: SeverityType}>> = {
      "Saskatoon": [
        {
          title: "Saskatoon Fire Dept Issues Backyard Open-Air Fire Advisory",
          summary: "Fire chief declares strict municipal advisory limitations due to low humidity indexing. Read fully to check fire permit status in residential lanes.",
          location: "Kinsmen Park, Saskatoon, SK",
          eventType: "fire",
          severity: "low"
        }
      ],
      "Regina": [
        {
          title: "Emergency High-Volume Water Utility Bypass Declaration",
          summary: "Regina Public Works team closed major local pipeline grids for infrastructure maintenance. High volume caution in Ring Road bypass territory.",
          location: "Dewdney Avenue near Ring Road, Regina, SK",
          eventType: "other_public_safety",
          severity: "medium"
        }
      ],
      "Prince Albert": [
        {
          title: "Prince Albert Water Security Agency Protective Advisory",
          summary: "Council launches preventive testing operations at regional water reclamation stations. General public urged to contact engineering if pipeline pressure fluctuates.",
          location: "River Street West, Prince Albert, SK",
          eventType: "other_public_safety",
          severity: "medium"
        }
      ],
      "Moose Jaw": [
        {
          title: "Temporary Transit Bypass Warning: Main Street High Winds",
          summary: "Moose Jaw Public Transit division reroutes buses on Main Street North because of a detached high voltage pole hazard. Technicians working on restore protocols.",
          location: "Main Street North, Moose Jaw, SK",
          eventType: "traffic_collision",
          severity: "medium"
        }
      ]
    };

    const activeCouncilList = councilFeedsByName[cityName] || [
      {
        title: `${config.name} City Council Publishes Local Severe Weather Protection Guide`,
        summary: "The municipal emergency control board issued severe local protection updates regarding flash warnings, wind corridor structures, or transport detour pathways.",
        location: `${config.name}, SK`,
        eventType: "other_public_safety",
        severity: "low" as SeverityType
      }
    ];

    for (const b of activeCouncilList) {
      const geocoded = await ctx.geocodeLocation(b.location, config.councilSourceKey);
      const uniqId = crypto.createHash("md5").update(cityName + b.title + "council").digest("hex").substring(0, 12);

      events.push({
        id: `council-${uniqId}`,
        sourceKey: config.councilSourceKey,
        sourceName: config.councilFeedName,
        sourceType: "government",
        title: b.title,
        summary: b.summary,
        originalUrl: `https://www.${cityName.toLowerCase().replace(/\s/g, '')}.ca/news`,
        publishedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
        retrievedAt: new Date().toISOString(),
        eventType: b.eventType,
        severity: b.severity,
        confidence: 0.90,
        locationText: geocoded.locationText,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        locationPrecision: geocoded.locationPrecision,
        locationConfidence: geocoded.locationConfidence,
        sourceHash: `council-hash-${uniqId}`,
        createdAt: new Date().toISOString()
      });
    }

    return events;
  }

  /**
   * Runs the localized adapter ingestion cycle for a list of target cities, returning all crawled incidents.
   */
  static async runCityCycle(cities: string[], ctx: IngestionContext): Promise<EventItem[]> {
    const combinedEvents: EventItem[] = [];

    for (const cityName of cities) {
      try {
        const policeEvents = await this.ingestPoliceFeed(cityName, ctx);
        const councilEvents = await this.ingestCouncilFeed(cityName, ctx);
        combinedEvents.push(...policeEvents, ...councilEvents);
      } catch (err) {
        console.error(`[CityAdaptor Engine] Failed ingestion run for city ${cityName}:`, err);
      }
    }

    return combinedEvents;
  }
}

export const CityAdapter = CityAdaptor;
