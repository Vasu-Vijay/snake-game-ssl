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

@app.route("/save_score", methods=["POST"])
def save_score():
    record_data = request.form
    #store data in a file

    try:
        with open("history.txt", "a+") as history_file:
            history_file.seek(0)
            
            if history_file.read() == '':
                history_file.seek(0)
                history_file.write("start_time,username,score,cause,time_alive\n")
                history_file.truncate()

            record = ",".join(record_data.values())
            history_file.write(record+"\n") #TODO: reformat this properly in future
    except Exception as e:
        return str(e) #TODO: if required format it properly
    else: 
        return "ok" #TODO: add a proper response

#init data.js
write_data()

# run the application
if __name__ == "__main__":
    app.run(debug=True)


try:
    with open("history.txt", "a+") as history_file:
        history_file.seek(0)
        if history_file.read() == '':
            history_file.seek(0)
            history_file.write("start_time,username,score,cause,time_alive\n")
            history_file.truncate()

        record = "hi,bi,si,di,wi"
        history_file.write(record+"\n") #TODO: reformat this properly in future
except Exception as e:
    prin(str(e)) #TODO: if required format it properly
else: 
    print("ok") #TODO: add a proper response