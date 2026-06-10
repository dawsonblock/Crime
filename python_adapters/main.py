import sqlite3
from classifier import setup_database
from saskatoon_police import ingest_saskatoon_police_news
from saskatchewan_rcmp import ingest_saskatchewan_rcmp_news
from saskatchewan_gov import ingest_saskatchewan_gov_news

def view_results(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM event_items")
    rows = cursor.fetchall()
    print("\n--- Current Event Items in Database ---")
    for row in rows:
        print(f"[{row[8]}] {row[7]} - {row[1]} (Confidence: {row[9]})")
    print(f"Total: {len(rows)} events processed and stored.")

if __name__ == "__main__":
    print("Initializing Database...")
    conn = setup_database()
    
    print("\nStarting Ingestion Adapters...")
    ingest_saskatoon_police_news(conn)
    ingest_saskatchewan_rcmp_news(conn)
    ingest_saskatchewan_gov_news(conn)
    
    view_results(conn)
    conn.close()
    print("\nAdapter ingestion complete.")
