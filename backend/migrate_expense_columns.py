
from sqlalchemy import inspect, text


def migrate_expense_columns():
    from app.database import engine

    with engine.begin() as connection:
        inspector = inspect(connection)

        if "expenses" not in inspector.get_table_names():
            raise RuntimeError("Expenses table not found.")

        columns = {
            column["name"]
            for column in inspector.get_columns("expenses")
        }

        if "anomaly_score" not in columns:
            connection.execute(text(
                "ALTER TABLE expenses ADD COLUMN "
                "anomaly_score FLOAT NOT NULL DEFAULT 0.0"
            ))
            print("Added anomaly_score.")

        if "severity" not in columns:
            connection.execute(text(
                "ALTER TABLE expenses ADD COLUMN "
                "severity VARCHAR(20) NOT NULL DEFAULT 'Normal'"
            ))
            print("Added severity.")

    print("Migration completed.")


if __name__ == "__main__":
    migrate_expense_columns()