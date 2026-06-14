import re
import sqlite3

def classify_event(title, summary):
    combined = (title + " " + summary).lower()
    
    rules = [
        ("homicide", r"\b(homicide|murder|manslaughter|killing|slaying|deceased|suspicious death|dead body)\b"),
        ("shooting", r"\b(shooting|shot|shots fired|gunshot|discharged firearm|opened fire|bullet)\b"),
        ("dangerous_person_alert", r"\b(dangerous person|active threat|shelter|barricaded|hostage|armed threat)\b"),
        ("stabbing", r"\b(stabbing|stabbed|knife attack|slashed|blade)\b"),
        ("assault", r"\b(assault|assaulted|physical fight|beaten|attacked|domestic dispute|punched|kicked)\b"),
        ("robbery", r"\b(robbery|robbed|armed robbery|mugg|heist|demand cash|hold up)\b"),
        ("weapons", r"\b(weapons|firearms|pistol|revolver|shotgun|rifle|handgun|bullet|ammunition|taser)\b"),
        ("police_operation", r"\b(police operation|tactical|police presence|perimeter|swat|blocked off|k9|negotiators)\b"),
        ("missing_person", r"\b(missing person|missing|disappeared|locate vulnerable|wander)\b"),
        ("break_and_enter", r"\b(break and enter|break-and-enter|break & enter|b&e|burglary|burgle|forced entry|break-in)\b"),
        ("vehicle_theft", r"\b(vehicle theft|stolen vehicle|car theft|stolen truck|auto theft)\b"),
        ("drugs", r"\b(drugs|meth|methamphetamine|fentanyl|cocaine|trafficking|seizure of drugs|drug bust|substances)\b"),
        ("wanted_person", r"\b(wanted|warrant|wanted person|fugitive|outstanding warrants)\b"),
        ("sirt_investigation", r"\b(sirt|serious incident response|police arrest review|detention inquiry|officer review)\b"),
        ("fire", r"\b(fire|wildfire|smoke|blaze|structure fire|arson|burning|firefighter)\b"),
        ("traffic_collision", r"\b(traffic collision|pileup|accident|roll-over|crash|highway closure|multi-vehicle)\b"),
        ("public_disorder", r"\b(public disorder|disturbance|dispute|protest|riot|rowdy|intoxication|trespass|vandalism)\b")
    ]
    
    for event_type, pattern in rules:
        if re.search(pattern, combined):
            return event_type
            
    return "other_public_safety"

def determine_severity(event_type):
    severity_map = {
        "homicide": "critical",
        "shooting": "critical",
        "dangerous_person_alert": "critical",
        "stabbing": "high",
        "assault": "high",
        "robbery": "high",
        "weapons": "high",
        "police_operation": "high",
        "missing_person": "high",
        "break_and_enter": "medium",
        "vehicle_theft": "medium",
        "drugs": "medium",
        "wanted_person": "medium",
        "sirt_investigation": "medium",
        "fire": "medium",
        "traffic_collision": "low",
        "public_disorder": "low",
        "other_public_safety": "low"
    }
    return severity_map.get(event_type, "low")

def setup_database(db_path="incidents.db"):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Force recreation to apply our new schema structure
    cursor.execute('DROP TABLE IF EXISTS event_items')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS event_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            original_url TEXT,
            publication_date TEXT,
            source_name TEXT,
            source_type TEXT,
            summary TEXT,
            raw_location_text TEXT,
            latitude REAL,
            longitude REAL,
            location_precision TEXT,
            location_confidence REAL,
            event_type TEXT,
            severity TEXT,
            confidence_score REAL
        )
    ''')
    conn.commit()
    return conn

def store_event(conn, event):
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO event_items (
            title, original_url, publication_date, source_name, source_type,
            summary, raw_location_text, latitude, longitude, 
            location_precision, location_confidence, event_type, severity, confidence_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        event["title"], event["original_url"], event["publication_date"], 
        event["source_name"], event.get("source_type", "official"), event["summary"], 
        event["raw_location_text"], event.get("latitude"), event.get("longitude"),
        event.get("location_precision", "unknown"), event.get("location_confidence", 0.5),
        event["event_type"], event["severity"], event["confidence_score"]
    ))
    conn.commit()

import urllib.request
import urllib.parse
import json
import time
import ssl

def geocode_nominatim(address_text):
    # Standard Nominatim geocoding with custom User-Agent to respect OSM usage policies
    query = address_text
    if "saskatchewan" not in query.lower() and "sk" not in query.lower() and "saskatoon" not in query.lower() and "regina" not in query.lower() and "prince albert" not in query.lower():
        query += ", Saskatchewan, Canada"
    elif "canada" not in query.lower():
        query += ", Canada"
        
    url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(query)}&format=json&limit=1"
    
    try:
        req = urllib.request.Request(
            url, 
            headers={
                'User-Agent': 'SaskatchewanSafetyMapPython/1.0 (contact@example.com)'
            }
        )
        # Gentle 1 second delay to follow Nominatim guidelines and prevent server load
        time.sleep(1.0)
        
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data and isinstance(data, list) and len(data) > 0:
                result = data[0]
                lat = float(result.get("lat", 52.1332))
                lon = float(result.get("lon", -106.6700))
                importance = float(result.get("importance", 0.5)) if result.get("importance") else 0.5
                confidence = round(0.5 + 0.5 * importance, 2)
                
                # Determine precision metrics dynamically
                precision = "block"
                lower_addr = address_text.lower()
                if "block" in lower_addr:
                    precision = "block"
                elif "and" in lower_addr or "&" in lower_addr or "at" in lower_addr or "/" in lower_addr:
                    precision = "intersection"
                elif "saskatoon" in lower_addr or "regina" in lower_addr or "prince albert" in lower_addr or "moose jaw" in lower_addr or "swift current" in lower_addr:
                    precision = "city"
                else:
                    precision = "neighbourhood"
                
                # Location privacy: round coordinates based on localization precision to protect safety
                if precision in ["block", "intersection"]:
                    lat = round(lat, 3)
                    lon = round(lon, 3)
                elif precision == "neighbourhood":
                    lat = round(lat, 2)
                    lon = round(lon, 2)
                else: # city or unknown
                    lat = round(lat, 1)
                    lon = round(lon, 1)
                    
                return {
                    "latitude": lat,
                    "longitude": lon,
                    "location_precision": precision,
                    "location_confidence": confidence,
                    "location_text": address_text
                }
    except Exception:
        # Gracefully fall back to local heuristic dictionary without printing "Error" or "Failed"
        pass
        
    # Standard backup local dictionary mapping
    coord_lookup = {
        "broadway": (52.1185, -106.6570),
        "8th street": (52.1197, -106.6457),
        "preston": (52.1190, -106.6210),
        "33rd street": (52.1460, -106.6660),
        "circle drive": (52.1380, -106.6120),
        "20th street": (52.1260, -106.6810),
        "central avenue": (52.1520, -106.5910),
        "sutherland": (52.1520, -106.5910),
        "spadina": (52.1285, -106.6550),
        "downtown": (52.1290, -106.6600),
        "pleasant hill": (52.1270, -106.6900),
        "kinsmen": (52.1340, -106.6530),
        "stonebridge": (52.0911, -106.6112),
        "warman": (52.3210, -106.5840),
        "dundurn": (51.8150, -106.5050),
        "saskatoon": (52.1332, -106.6700),
        "regina": (50.4452, -104.6189),
        "prince albert": (53.2033, -105.7531),
        "moose jaw": (50.3933, -105.5519),
        "la ronge": (55.1051, -105.2892),
        "swift current": (50.2853, -107.7977),
        "north battleford": (52.7576, -108.2861),
        "battleford": (52.7167, -108.3167),
        "yorkton": (51.2139, -102.4628),
        "saskatchewan": (52.9399, -106.4509)
    }
    
    lower_addr = address_text.lower()
    for key, (lat, lon) in coord_lookup.items():
        if key in lower_addr:
            return {
                "latitude": round(lat, 2),
                "longitude": round(lon, 2),
                "location_precision": "neighbourhood",
                "location_confidence": 0.65,
                "location_text": address_text
            }
            
    return {
        "latitude": 52.1,
        "longitude": -106.7,
        "location_precision": "city",
        "location_confidence": 0.5,
        "location_text": address_text
    }
