import { EventItem } from "../types";
import { ruleBasedClassifier } from "../utils/classifier";
import { geocodeBatchLocation } from "../utils/geo";
import crypto from "crypto";

export async function fetchSaskatoonPoliceNews(): Promise<EventItem[]> {
  const newsEvents: EventItem[] = [];
  try {
    const response = await fetch("https://saskatoonpolice.ca/news/rss.xml", { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return [];
    const xmlText = await response.text();
    const items = xmlText.split('<item>').slice(1).map(i => {
      const titleMatch = i.match(/<title>(.*?)<\/title>/);
      const linkMatch = i.match(/<link>(.*?)<\/link>/);
      const descMatch = i.match(/<description>(.*?)<\/description>/);
      const dateMatch = i.match(/<pubDate>(.*?)<\/pubDate>/);
      return {
        title: titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : '',
        link: linkMatch ? linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : '',
        description: descMatch ? descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : '',
        date: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
      };
    });

    const locationsToResolve = items.map(item => item.title + " " + item.description);
    const resolvedLocations = await geocodeBatchLocation(locationsToResolve, "sps_news");

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.title) continue;
      const uniqueId = "sps-" + crypto.createHash("md5").update(item.link).digest("hex").substring(0, 16);
      const geocoded = resolvedLocations[i];
      const classified = ruleBasedClassifier(item.title, item.description);
      
      newsEvents.push({
        id: uniqueId,
        sourceKey: "sps_news",
        sourceName: "Saskatoon Police Service",
        sourceType: "official",
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
        displayLatitude: geocoded.displayLatitude,
        displayLongitude: geocoded.displayLongitude,
        locationPrecision: geocoded.locationPrecision,
        locationConfidence: geocoded.locationConfidence,
        sourceHash: "sps-hash-" + uniqueId,
        createdAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error("Error fetching SPS news:", err);
  }
  return newsEvents;
}
