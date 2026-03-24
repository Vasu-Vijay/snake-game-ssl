## Aim

This project is a browser-based Snake game(extended) with a full three-layer architecture: a JavaScript frontend that the player interacts with, a Python (Flask) backend that receives and stores game results, and a Bash administration script for inspecting and managing stored data from the terminal.

## Workflow

```
Browser (JS) -> Post /save_score -> Flask (Python) -> history.txt <- Bash script
```

- The browser game sends score data to the backend using a POST request.
- The Flask server processes and stores the results in `history.txt`.
- The Bash script allows terminal-based inspection and management of stored scores.

## How to run

Clone the repository:
```
git clone https://github.com/Vasu-Vijay/snake-game-ssl.git
cd snake-game-ssl
```

Install dependencies:
```
pip install -r requirements.txt
```

Run the server:
```
python3 app.py
```

The server will start running at http://127.0.0.1:5000.

## TO-DO

- [ ] Make basic game on canvas.
- [ ] Add/make graphics/sprites.
- [ ] Add the flask server and the /save_score method.
- [ ] Add various fruits and suitable animations.
- [ ] Add modes.
- [ ] Add modals using Bootstrap 5, and stylize them using CSS fine-tuning(while maintaining professional design).
- [ ] Make the admin.sh script.