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
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS event_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            original_url TEXT,
            publication_date TEXT,
            source_name TEXT,
            summary TEXT,
            raw_location_text TEXT,
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
            title, original_url, publication_date, source_name, 
            summary, raw_location_text, event_type, severity, confidence_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        event["title"], event["original_url"], event["publication_date"], 
        event["source_name"], event["summary"], event["raw_location_text"], 
        event["event_type"], event["severity"], event["confidence_score"]
    ))
    conn.commit()
