from flask import Flask, render_template, request
import os
import re
from datetime import datetime

files_array = []
death_causes = ["WALL", "SELF"]


def list_files_scandir(path="."):  # recursively find files in ./static/sprites folder
    with os.scandir(path) as entries:
        for entry in entries:
            if entry.is_file():
                if not (re.search(r"\.tmp$", entry.path)):
                    files_array.append("." + entry.path)
            elif entry.is_dir():
                list_files_scandir(entry.path)


def write_data():
    directory_path = "./static/media/sprites"
    list_files_scandir(directory_path)

    file_path = "./static/js/data.js"
    content_to_write = "const images = " + str(
        files_array
    )  # to make it like a JS array

    try:
        with open(file_path, "w") as file:
            file.write(content_to_write)
        print(f"Content written to {file_path} successfully.")
    except IOError as e:
        print(f"Error writing to file: {e}")


def validate_record(record_data):
    # [2026-04-11 05:28:19],guest_user,3,WALL,2688
    try:
        start_time, username, score, cause, time_alive = record_data.values()

        valid_date = bool(datetime.strptime(start_time, "[%Y-%m-%d %H:%M:%S]"))
        valid_format = bool(
            re.search("^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]$", start_time)
        )

        if (valid_date and valid_format) is not True:
            return f"{valid_date}, {valid_format}, start_time_error"

        if len(username) <= 3 or len(username) >= 19:
            return "username_length_error"

        if not bool(re.search("^[A-Za-z0-9_]+$", username)):
            return "invalid_chars_in_username"

        if int(score) < 2:
            return "score_invalid"

        if cause not in death_causes:
            return "invalid_cause"

        if float(time_alive) <= 0 or not bool(
            re.search("^\d+(\.\d{0,3})?$", time_alive)
        ):
            return "invalid_time_alive"

        return None

    except Exception as e:
        return str(e)


app = Flask(__name__)


@app.route("/")
def start():
    return render_template("index.html")


@app.route("/save_score", methods=["POST"])
def save_score():
    record_data = request.form

    # store data in a file
    try:
        with open("history.txt", "a+") as history_file:
            history_file.seek(0)

            if history_file.read() == "":
                history_file.seek(0)
                history_file.write("start_time,username,score,cause,time_alive\n")
                history_file.truncate()

            error = validate_record(record_data)
            print(error)
            if error:
                return error

            start_time, username, score, cause, time_alive = record_data.values()

            record = ",".join(
                [start_time, username, score, cause, "{:.3f}".format(float(time_alive))]
            )  # TODO: test for all edge cases
            history_file.write(record + "\n")  # TODO: reformat this properly in future

    except Exception as e:
        return str(e)  # TODO: if required format it properly
    else:
        return "ok"  # TODO: add a proper response


# init data.js
write_data()

# run the application
if __name__ == "__main__":
    app.run(debug=True)
