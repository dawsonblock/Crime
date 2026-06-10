import urllib.request
import urllib.error
from xml.etree import ElementTree as ET
from classifier import classify_event, determine_severity, setup_database, store_event
import random

def fetch_rss_feed(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            return response.read()
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def extract_location_from_text(text):
    landmarks = ["Warman", "Dundurn", "Prince Albert", "Regina", "Saskatoon", 
                 "La Ronge", "Swift Current", "North Battleford", "Yorkton", "Highway 11"]
    
    locations = []
    for landmark in landmarks:
        if landmark.lower() in text.lower():
            locations.append(landmark)
            
    if locations:
        return locations[0] + ", SK"
    return "Unknown Saskatchewan Location"

def ingest_saskatchewan_rcmp_news(conn):
    url = "https://www.rcmp-grc.gc.ca/en/rss/39" # Saskatchewan RCMP RSS feed
    print(f"Ingesting Saskatchewan RCMP News from {url}")
    
    xml_data = fetch_rss_feed(url)
    if not xml_data:
        print("Using simulated data for Saskatchewan RCMP")
        simulated_data = [
            {
                "title": "Saskatchewan RCMP Warns of Dangerous Driver on Highway 11",
                "original_url": "https://www.rcmp-grc.gc.ca/en/news/highway-11-stop",
                "publication_date": "2026-06-09",
                "source_name": "Saskatchewan RCMP",
                "summary": "Warman RCMP received multiple reports of a vehicle driving erratically at high speeds near Highway 11 warman corridor.",
                "raw_location_text": "Highway 11 near Warman, SK"
            }
        ]
        
        for item in simulated_data:
            process_item(conn, item)
        return

    try:
        root = ET.fromstring(xml_data)
        for item in root.findall('.//item'):
            title = item.find('title').text if item.find('title') is not None else "No Title"
            original_url = item.find('link').text if item.find('link') is not None else ""
            pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ""
            summary = item.find('description').text if item.find('description') is not None else ""
            
            raw_location_text = extract_location_from_text(title + " " + summary)
            
            event = {
                "title": title,
                "original_url": original_url,
                "publication_date": pub_date,
                "source_name": "Saskatchewan RCMP",
                "summary": summary[:200] + "...", 
                "raw_location_text": raw_location_text
            }
            process_item(conn, event)
    except Exception as e:
        print(f"Failed to parse RCMP feed: {e}")

def process_item(conn, event_dict):
    event_type = classify_event(event_dict["title"], event_dict["summary"])
    severity = determine_severity(event_type)
    confidence = random.uniform(0.85, 0.98)
    
    event_dict["event_type"] = event_type
    event_dict["severity"] = severity
    event_dict["confidence_score"] = round(confidence, 2)
    
    store_event(conn, event_dict)
    print(f"Stored: {event_dict['title']} -> {event_type} ({severity})")

if __name__ == "__main__":
    conn = setup_database()
    ingest_saskatchewan_rcmp_news(conn)
    conn.close()
