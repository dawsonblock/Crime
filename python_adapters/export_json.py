import sqlite3
import json
import os

def export_to_json():
    db_path = os.path.join(os.path.dirname(__file__), "incidents.db")
    if not os.path.exists(db_path):
        print(json.dumps([]))
        return

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM event_items")
        rows = cursor.fetchall()
        
        events = []
        for r in rows:
            events.append({
                "id": f"py-evt-{r['id']}",
                "title": r["title"],
                "originalUrl": r["original_url"],
                "publishedAt": r["publication_date"],
                "sourceName": r["source_name"],
                "sourceType": r["source_type"] if "source_type" in r.keys() else "official",
                "summary": r["summary"],
                "locationText": r["raw_location_text"],
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "locationPrecision": r["location_precision"] if "location_precision" in r.keys() else "block",
                "locationConfidence": r["location_confidence"] if "location_confidence" in r.keys() else 0.85,
                "eventType": r["event_type"],
                "severity": r["severity"],
                "confidence": r["confidence_score"]
            })
            
        conn.close()
        print(json.dumps(events, indent=2))
    except Exception as e:
        # Avoid breaking JSON parsing with clean error list
        print(json.dumps([{"error": str(e)}]))

if __name__ == "__main__":
    export_to_json()
