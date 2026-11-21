
from sqlalchemy import create_engine, inspect, text
from pathlib import Path


def migrate_user_profile(database_path: str):
    path = Path(database_path).resolve()

    if not path.is_file():
        raise FileNotFoundError(
            f"Database does not exist: {path}"
        )

    engine = create_engine(
        f"sqlite:///{path.as_posix()}",
        connect_args={"check_same_thread": False},
    )

    try:
        with engine.begin() as connection:
            inspector = inspect(connection)

            if "users" not in inspector.get_table_names():
                raise RuntimeError("Users table not found.")

            columns = {
                column["name"]
                for column in inspector.get_columns("users")
            }

            if "name" not in columns:
                connection.execute(
                    text("ALTER TABLE users ADD COLUMN name VARCHAR(150)")
                )
                print("Added users.name.")
            else:
                print("users.name already exists.")

        print("Migration completed successfully.")

    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(
        "Import this script and call migrate_user_profile() "
        "with an explicitly verified database path."
    )