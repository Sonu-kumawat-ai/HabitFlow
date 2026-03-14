from dotenv import load_dotenv
import os

load_dotenv()


def _to_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


class Config:
    SECRET_KEY = os.getenv('SECRET_KEY')
    MONGO_URI = os.getenv('MONGO_URI')
    PORT = int(os.getenv('PORT', '5000'))
    FLASK_DEBUG = _to_bool(os.getenv('FLASK_DEBUG'), default=True)
