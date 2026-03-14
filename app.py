from modules import create_app
from modules.config import Config

app = create_app()


if __name__ == '__main__':
    app.run(debug=Config.FLASK_DEBUG, port=Config.PORT)
