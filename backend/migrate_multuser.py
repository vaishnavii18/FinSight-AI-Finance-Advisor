import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "finance.db"


def column_exists(cursor, table_name, column_name):
    columns = cursor.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(column[1] == column_name for column in columns)


def main():
    print(f"Database: {DB_PATH}")

    connection = sqlite3.connect(DB_PATH)
    cursor = connection.cursor()

    try:
        # Add user_id to expenses if it does not already exist.
        if not column_exists(cursor, "expenses", "user_id"):
            cursor.execute(
                "ALTER TABLE expenses ADD COLUMN user_id INTEGER"
            )
            print("Added expenses.user_id")
        else:
            print("expenses.user_id already exists")

        # Add user_id to budgets if it does not already exist.
        if not column_exists(cursor, "budgets", "user_id"):
            cursor.execute(
                "ALTER TABLE budgets ADD COLUMN user_id INTEGER"
            )
            print("Added budgets.user_id")
        else:
            print("budgets.user_id already exists")

        connection.commit()

        print("Migration completed successfully.")

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


if __name__ == "__main__":
    main()
