from flask import Flask, render_template, request
import os
import re

files_array=[] 

def list_files_scandir(path='.'): # recursively find files in ./static/sprites folder
    with os.scandir(path) as entries:
        for entry in entries:
            if entry.is_file():
                if not (re.search(r"\.tmp$", entry.path)):
                    files_array.append("."+entry.path)
            elif entry.is_dir():
                list_files_scandir(entry.path)

def write_data():
    directory_path = './static/sprites'
    list_files_scandir(directory_path)

    file_path = "./static/js/data.js"
    content_to_write = "const images = "+str(files_array) # to make it like a JS array

    try:
        with open(file_path, 'w') as file:
            file.write(content_to_write)
        print(f"Content written to {file_path} successfully.")
    except IOError as e:
        print(f"Error writing to file: {e}")

app = Flask(__name__)

@app.route("/")
def start():
    return render_template('index.html')

#init data.js
write_data()

# run the application
if __name__ == "__main__":
    app.run(debug=True)