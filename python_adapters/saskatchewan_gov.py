import urllib.request
import urllib.error
import ssl
from xml.etree import ElementTree as ET
from classifier import classify_event, determine_severity, setup_database, store_event, geocode_nominatim
import random

def fetch_rss_feed(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx) as response:
            return response.read()
    except urllib.error.HTTPError as he:
        print(f"Notice: RSS endpoint {url} unreachable (HTTP {he.code}).")
        return None
    except Exception as e:
        print(f"Notice: RSS endpoint {url} bypass (Reason: {e}).")
        return None

def extract_location_from_text(text):
    landmarks = ["Prince Albert Correctional Centre", "Saskatoon", "Regina", "La Ronge", 
                 "Highway 2", "Northern Saskatchewan", "Correctional"]
    
    locations = []
    for landmark in landmarks:
        if landmark.lower() in text.lower():
            locations.append(landmark)
            
    if locations:
        return locations[0] + ", SK"
    return "Saskatchewan, Canada"

import os

def ingest_saskatchewan_gov_news(conn):
    if os.environ.get("DEMO_MODE") != "true":
        print("[Saskatchewan Gov] Skipping simulated data in production.")
        return
    # Simulated endpoint for Government of Saskatchewan (as their actual site may use complicated HTML logic)
    url = "https://www.saskatchewan.ca/government/news-and-media"
    print(f"Ingesting Saskatchewan Government News from {url}")
    
    # We will simulate fetching from a theoretical Gov API or parsing their page
    print("Using simulated data for Saskatchewan Government (SIRT/Fire Notices)")
    simulated_data = [
        {
            "title": "SIRT Investigates Detention Facility Incident",
            "original_url": "https://www.saskatchewan.ca/government/news/sirt-pa",
            "publication_date": "2026-06-08",
            "source_name": "Government of Saskatchewan",
            "summary": "The Serious Incident Response Team (SIRT) has been directed to investigate a medical distress event in the Prince Albert Correctional Centre.",
            "raw_location_text": "Prince Albert Correctional Centre, Prince Albert, SK"
        },
        {
            "title": "RCMP Warns of Dense Forest Smoke Hazards",
            "original_url": "https://www.saskatchewan.ca/government/fire-notices",
            "publication_date": "2026-05-25",
            "source_name": "Government of Saskatchewan",
            "summary": "Government alerts warn travellers heading north toward La Ronge of severe roadway visibility limitations due to nearby organic lightning-sparked forest fires.",
            "raw_location_text": "Highway 2 Corridor, North of Saskatoon to La Ronge, SK"
        }
    ]
    
    for event in simulated_data:
        process_item(conn, event)

def process_item(conn, event_dict):
    event_type = classify_event(event_dict["title"], event_dict["summary"])
    severity = determine_severity(event_type)
    confidence = random.uniform(0.85, 0.98)
    
    # Geocode dynamic location
    geocoded = geocode_nominatim(event_dict["raw_location_text"])
    
    event_dict["event_type"] = event_type
    event_dict["severity"] = severity
    event_dict["confidence_score"] = round(confidence, 2)
    event_dict["latitude"] = geocoded["latitude"]
    event_dict["longitude"] = geocoded["longitude"]
    event_dict["location_precision"] = geocoded["location_precision"]
    event_dict["location_confidence"] = geocoded["location_confidence"]
    event_dict["source_type"] = "government"
    
    store_event(conn, event_dict)
    print(f"Stored: {event_dict['title']} -> {event_type} ({severity}) @ {geocoded['latitude']},{geocoded['longitude']}")

if __name__ == "__main__":
    conn = setup_database()
    ingest_saskatchewan_gov_news(conn)
    conn.close()
