import { EventItem } from "../types";
import { ruleBasedClassifier } from "../utils/classifier";
import { geocodeLocation } from "../utils/geo";
import crypto from "crypto";

export async function fetchGovSaskNews(): Promise<EventItem[]> {
  // Simulated data as per original python adapter
  const simulatedData = [
    {
      title: "SIRT Investigates Detention Facility Incident",
      originalUrl: "https://www.saskatchewan.ca/government/news/sirt-pa",
      publishedAt: "2026-06-08T00:00:00Z",
      summary: "The Serious Incident Response Team (SIRT) has been directed to investigate a medical distress event in the Prince Albert Correctional Centre.",
      locationText: "Prince Albert Correctional Centre, Prince Albert, SK"
    },
    {
      title: "RCMP Warns of Dense Forest Smoke Hazards",
      originalUrl: "https://www.saskatchewan.ca/government/fire-notices",
      publishedAt: "2026-05-25T00:00:00Z",
      summary: "Government alerts warn travellers heading north toward La Ronge of severe roadway visibility limitations due to nearby organic lightning-sparked forest fires.",
      locationText: "Highway 2 Corridor, North of Saskatoon to La Ronge, SK"
    }
  ];

  const newsEvents: EventItem[] = [];
  for (const item of simulatedData) {
    const uniqueId = "govsask-" + crypto.createHash("md5").update(item.originalUrl).digest("hex").substring(0, 16);
    const geocoded = await geocodeLocation(item.locationText, "gov_sask_news");
    const classified = ruleBasedClassifier(item.title, item.summary);
      
    newsEvents.push({
      id: uniqueId,
      sourceKey: "gov_sask_news",
      sourceName: "Government of Saskatchewan",
      sourceType: "government",
      title: item.title,
      summary: item.summary,
      originalUrl: item.originalUrl,
      publishedAt: item.publishedAt,
      retrievedAt: new Date().toISOString(),
      eventType: classified.eventType,
      severity: classified.severity,
      confidence: classified.confidence,
      locationText: geocoded.locationText,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      displayLatitude: geocoded.displayLatitude,
      displayLongitude: geocoded.displayLongitude,
      locationPrecision: geocoded.locationPrecision,
      locationConfidence: geocoded.locationConfidence,
      sourceHash: "govsask-hash-" + uniqueId,
      createdAt: new Date().toISOString()
    });
  }
  return newsEvents;
}
