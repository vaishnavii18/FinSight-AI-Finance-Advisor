
import sqlite3

conn = sqlite3.connect("finance.db")
cursor = conn.cursor()

columns = {
    "monthly_income": "FLOAT NOT NULL DEFAULT 0.0",
    "total_monthly_budget": "FLOAT NOT NULL DEFAULT 0.0",
    "currency": "VARCHAR(10) NOT NULL DEFAULT 'INR'",
    "theme": "VARCHAR(20) NOT NULL DEFAULT 'system'",
}

existing = {
    row[1]
    for row in cursor.execute("PRAGMA table_info(users)").fetchall()
}

for name, definition in columns.items():
    if name not in existing:
        cursor.execute(
            f"ALTER TABLE users ADD COLUMN {name} {definition}"
        )
        print(f"Added users.{name}")

conn.commit()
conn.close()

print("Settings migration completed.")