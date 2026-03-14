from flask import Flask
from pathlib import Path

from modules.config import Config
from modules.extensions import init_extensions
from modules.filters import register_template_filters
from modules.routes import auth_bp, dashboard_bp, tasks_bp


def create_app():
    project_root = Path(__file__).resolve().parent.parent
    app = Flask(
        __name__,
        template_folder=str(project_root / 'templates'),
        static_folder=str(project_root / 'static'),
    )
    app.config.from_object(Config)

    init_extensions(app)
    register_template_filters(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(dashboard_bp)

    return app
