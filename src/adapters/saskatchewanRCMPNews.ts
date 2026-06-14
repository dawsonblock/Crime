import { EventItem } from "../types";
import { ruleBasedClassifier } from "../utils/classifier";
import { geocodeLocation } from "../utils/geo";
import crypto from "crypto";

export async function fetchSaskatchewanRCMPNews(): Promise<EventItem[]> {
  const newsEvents: EventItem[] = [];
  try {
    const response = await fetch("https://www.rcmp-grc.gc.ca/en/rss/39", { headers: { 'User-Agent': 'Mozilla/5.0' } });
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

    for (const item of items) {
      if (!item.title) continue;
      const uniqueId = "rcmp-" + crypto.createHash("md5").update(item.link).digest("hex").substring(0, 16);
      const geocoded = await geocodeLocation(item.title + " " + item.description, "rcmp_news");
      const classified = ruleBasedClassifier(item.title, item.description);
      
      newsEvents.push({
        id: uniqueId,
        sourceKey: "rcmp_news",
        sourceName: "Saskatchewan RCMP News",
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
        sourceHash: "rcmp-hash-" + uniqueId,
        createdAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error("Error fetching RCMP news:", err);
  }
  return newsEvents;
}
