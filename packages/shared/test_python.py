import sys
import json
import os

# Add current dir to path to import python package
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from python.session import Session

def main():
    try:
        with open("fixtures/sample_session.json", "r") as f:
            data = json.load(f)
        session = Session(**data)
        print("Pydantic validation passed! Session ID:", session.id)
    except Exception as e:
        print("Pydantic validation failed:", e)
        sys.exit(1)

if __name__ == "__main__":
    main()
