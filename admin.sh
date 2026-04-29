#/bin/bash

############################### GENERAL COMMENTS ###################################

#bash does not interpret escaping inside in read in "" but understands it in $''

#read -e is used to allow interactive input(uses of arrow keys,ctrl+a ,etc..)

#\001 and \002 are used in read so that it does not calculate length of text written in between them during calculation of length of prompt
#This is used if the terminal size is less than required then prompt overwrites itself rather than writing in new line
#This happens because \e[32m does not actually occupy space in printing but read command counts its length in the prompt
#Due to miscalculation it runs into some error and overwrite the line 

#printf "\e[1A\e[2K" is used to move cursor up from current position and clear the line from the terminal output
#the if else condition along with variables like 'attempt' and 'attemp' is used to clear lines 
#if first time invalid command is used then there will be no error message earlier so remove lines accordingly
#if invalid command is entered sequentially than clearing will be done accordingly

#if (NR==1) {print $0} is used in awk scripts to print first_line of 'history' as it should be always present in the file.

#printf "\033c" clears the terminal screen
#####################################################################################

############################### GLOBAL VARIABLES ###################################

#Specified Current User/Users being analysed.
user=""
#first line of history.txt
first_line="start_time,username,score,cause,time_alive"

#time of first and last game in history.txt
#initialised to default 
first_game_time="0001-01-01 00:00:00"
end_game_time="0001-01-01 00:00:00"
#####################################################################################

##################################### UTILITY #######################################

#Exit the menu
Exit(){
    printf "\033c"
    rm -f misformatted.tmp history.tmp
    exit
}
#Checks if history.txt has records and describes further action which can be taken
#Used to handle discrepancy if during deleting entries history.txt is left with no record and no other operations are fesible except log rotation
check_history(){
    if [[ $(grep -nv -E "^$" history.txt | wc -l | cut -d " " -f 1) -eq 1 ]];then
        #If backup file exist than you can either restore logs or exit the program 
        if [[ -f ./backup/history.tar.gz ]];then
            local attempt=0
            while true;do
                read -ern 1 -p $'\e[31mNo Records in history.txt\nA bakup log file exist do you want to restore it or exit? (1/2) \e[0m' input
                printf "\n"
                if [[ "$input" == "q" ]];then
                    Exit
                elif ! valid_command 2 "$input";then
                    printf "\e[31mEnter a valid command\e[0m\n"
                elif [[ "$input" == 2 ]]; then
                    Exit
                elif [[ "$input" == 1 ]]; then
                    Restore_Logs
                    break
                fi
            done
        #If no backup then no other functions can be utilized and hence exiting the program
        else
            printf "\e[31mNo Records in history.txt\nNo backup file found.\n\e[32m____________Exiting the program." 
            for i in {1..5};do
                sleep 1
                printf "."
            done
            Exit
        fi
    fi
}

#update all essential stats after each core function
update_stats(){
    check_history #Check discrepancy in history.txt

    #update default game times
    first_game_time=$(grep -vE "^$" history.txt |tail -n +2 | sort | head -1 | cut -d "]" -f1 | cut -d "[" -f2)
    last_game_time=$(grep -vE "^$" history.txt |tail -n +2 | sort | tail -1 | cut -d "]" -f1 | cut -d "[" -f2)

    #update available users in history.txt and stores it as a sting
    #uses ":" as separator for username
    user_list=":$(grep -vE "^$" history.txt |tail -n +2 | cut -d',' -f2 | sort -u | tr '\n' ':' )"
    #initializes default user(all) if previous user is not found in history.txt
    if [[ "$user" == "" || "$user_list" =~ ":$user:" ]]; then
        :
    else
        user=""
        printf "\e[32mSelected User has been changed to all due to no remaining records of previously chosen user\n\e[0m"
    fi
}
#####################################################################################

#################################### VALIDATION ####################################

#To be used to validate if command entered is correct or not
#takes 2 arguments --> First is Largest numeric option to be considered valid
#                  --> Second is the input from user 
valid_command(){
    if [[ "$2" =~ ^[1-$1]$ ]]; then 
        return 0
    else 
        return 1
    fi 
}

#Validates if entered command is supposed to quit the ongoing function and return to menu
#takes input from user as an argument
valid_command_quit(){
    if [[ "$1" == "q" ]];then
        printf "\033c"
        menu_display
        return 0
    else
        return 1
    fi
}

#validates if the command is used to invoke default values
#takes input from user as an argument
valid_command_default(){
    if [[ "$1" == "" ]];then
        return 0
    else
        return 1
    fi
}

#To be used to validate if user has entered valid user or not
#takes input from user as an argument
valid_user(){
    if [[ $user_list =~ ":$1:" || "$1" == "" ]]; then
        return 0
    else 
        return 1
    fi
}

#To be used to validate if the entered field is a valid timestamp
#Takes any no. of entries as argumnets 
#If no.of arguments or format does not satisfy the standard format then rejects it
Validate_Timestamp(){
    #Basic Regex Check
    if [[ "$*" =~ ^[0-9]+-[0-9]{2}-[0-9]{2}\ [0-9]{2}:[0-9]{2}:[0-9]{2}$ ]]; then
    #Comparing with standard time format
    #Using error message thrown as the condition of if-else statement to access result
        if date -d "$*" "+%Y-%m-%d %H:%M:%S" >/dev/null 2>&1 ; then
            return 0
        else
            return -1
        fi
    else 
        return -1
    fi
}

#####################################################################################

#################################### UI DISPLAY ####################################

#Used to display DYNAMIC MENU in a tabluar form which is compatible with size of terminal
tabular_display(){
    COLS=3 
    PADDING=1

    # -2 because we will have to add cols + 1 characters for start,middle ,end
    COL_WIDTH=$(($(tput cols) / COLS - 2)) #$COLUMNS does not work as it needs to be run in terminal. $tput cols handles it as long as terminal is active
    # Used to wrap text such that it stays in a block in menu
    function wrap_text() {
        fold -s -w $((COL_WIDTH - 2*PADDING)) <<<"$1"
    }

    #pints an entire row in the table
    function print_row() {
        local data_row=("$@")
        local wrapped=() #stores wrapped text for each block
        local maxlines_block=0 #max no.of lines used in a row to adjust height of column consistently in all blocks

        #iterating over each column in current row
        for col in "${data_row[@]}"
        do
            lines=() #Stores wrapped lines in current column

             #Read wrapped output per line from wrap_text function
            while read -e -r line; do
                lines+=("$line")
            done < <(wrap_text "$col")

            #Store the wrapped column content as a single multi-line string
            wrapped+=("$(printf "%s\n" "${lines[@]}")")

            #calulate maxline in each cell of the column in current row 
            if [[ "${#lines[@]}" -gt "$maxlines_block" ]]; then
                maxlines_block=${#lines[@]}
            fi
        done

        for((y=0;y<COLS;y++)) #Prints separator between columns
        do  
            printf "│"
            printf "%*s" $PADDING ""
                printf "%-*s" $((COL_WIDTH - 2*PADDING)) 
                printf "%*s" $PADDING ""
        done
        printf "│"
        printf "\n"

        #Iterating over stored max no.of lines in the row
        for ((line=0; line<maxlines_block+1; line++))
        do
            printf "│"
            for ((j=0; j<COLS; j++))
            do
                # Extract this block's lines
                IFS=$'\n' read -e -d '' -r -a block_lines <<< "${wrapped[j]}" #-d is important as otherwise reading stops at even spaces
                text="${block_lines[line]}"

                # Padding + alignment
                printf "%*s" $PADDING ""
                printf "\e[96m%-*s\e[0m" $((COL_WIDTH - 2*PADDING)) "$text"
                printf "%*s" $PADDING ""
                printf "│"
            done
            printf "\n"
        done
    }
    
    #Prints the top border of table
    function print_border_top(){
        printf "┌"
        for ((c=0; c<COLS; c++)); do
            for ((w=0; w<COL_WIDTH; w++)); do
                printf "─"
            done
            if [ $c != $(($COLS-1)) ];then
                printf "┬"
            else
                printf "┐"  
            fi
        done
        printf "\n"
    }

    #print inline borders between 2 entries
    function print_border() {
        printf "├"
        for ((c=0; c<COLS; c++)); do
            for ((w=0; w<COL_WIDTH; w++)); do
                printf "─"
            done
            if [ $c != $(($COLS-1)) ]; then
                printf "┼"
            fi
        done
        printf "┤\n"
    }

    #prints bottom border of the table
    function print_border_bottom(){
       printf "└"
        for ((c=0; c<COLS; c++)); do
            for ((w=0; w<COL_WIDTH; w++)); do
                printf "─"
            done
            if [ $c != $(($COLS-1)) ];then
                printf "┴"
            else
                printf "┘"  
            fi
        done
        printf "\n" 
    }

    #Prints the Table
    #iteration over all options 
    for ((i=0; i<${#options[@]}; i+=COLS))
    do
        if [ $i == 0 ]; then
            print_border_top
        else
            print_border
        fi
        
        #initialize an array to store options to be displayed in each row by iterating over no.of columns in a row
        row=()
        for ((j=0; j<COLS; j++))
        do
            row+=("${options[i+j]}")
        done
        print_row "${row[@]}"
        
    done
    print_border_bottom
}

#Formats the output data 
output_table(){ 
    awk -F "," '
    {
    #stores the entries of each field in each line as a 2D array
        for(i=1 ;i<6;i++){
            field[NR,i]=$i
        }
    #stores the max field width in an array
        for (f = 1; f <= 5; f++) {
            if (length($f) > max_col[f]) {
                max_col[f] = length($f) 
            }
        }
    }
    END {

    #prints the upper border of table
        printf "┌"
        for (i = 1; i <= 5; i++) {
            for (j = 1; j <= max_col[i]; j++) {printf "─"}
            if (i < 5) printf "┬"
        }
        printf "┐\n"

    #prints the records and border after it
        for(l=1;l<NR;l++){
            printf "│"
            for(f=1;f<6;f++){
                printf "%-"max_col[f]"s│",field[l,f]
            }
            printf "\n"
            printf "├"
            for (i = 1; i <= 5; i++) {
                for (j = 1; j <= max_col[i]; j++) {printf "─"}
                if (i < 5) printf "┼"
            }
            printf "┤\n"
        }
        printf "│"
        for(f=1;f<6;f++){
            printf "%-"max_col[f]"s│",field[l,f]
        }
        printf "\n"
        printf "└"

    #prints the lower border of table
        for (i = 1; i <= 5; i++) {
            for (j = 1; j <= max_col[i]; j++) {printf "─"}
            if (i < 5) printf "┴"
        }
        printf "┘\n"       
    }
    ' | less
}
#####################################################################################

###########################  MISFORMATTED RECORD HANDLING ###########################

#View misformatted records
view_misformatted_records(){
    less -N misformatted.tmp
}

#Stores misformatted records in history.txt in a file misformatted.tmp
check_misformatted(){
    awk -F "," '{
        if (NR==1){print $0}
        else if ($0 ~ /^\[[0-9]+-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]\],[a-zA-Z0-9_]+,[0-9]+,[A-Z]+,[0-9]+[.]?[0-9]*$/) {
            line=$0
            t_stamp=$1
            split(t_stamp,a,"]");
            split(a[1],b,"[");
            if (!system("date -d \"" b[2] "\" \"+%Y-%m-%d %H:%M:%S\" >/dev/null 2>&1")){
                if ($4 !~ /(WALL|SELF)/){print line}
                else {}
            } else {
                print line
            }
        } else { print $0 }
    }' history.txt > misformatted.tmp
}

#Handles misformatted records at the start of program to avoid conflicts/errors when running program
handle_misformatted_records(){
    check_misformatted #Stores misformatted records

    #No. of misformatted lines in history.txt stored in misformatted.tmp
    local lines=$(grep -nvE "^$" misformatted.tmp | wc -l | cut -d " " -f1)

    #If no.of lines is 1 i.e. it will be the starting line of history.txt then there is no misformatted records in history.txt
    #Else there will be some misformatted records in history.txt
    if [[ "$lines" -ne 1 ]]; then

        #options to be displayed in case there are misformatted entries at starting of the program
        misformat_options=("view_misformatted_records" "delete_misformatted_records" "Exit")


        while true; do
            printf "\033c"
            printf "\e[31mThere are misformatted records in history.txt. Choose a further course of action\e[0m\n"
            tabular_display
            read -ern 1 -p $'\001\e[33m\002Enter command : \001\e[0m\002' command 
            #exit in case of command received is q
            if [[ "$command" == 'q' ]]; then
                Exit

            #validate command
            elif valid_command ${#misformat_options[@]} $command; then
                ${misformat_options[$command - 1]}
                if [[ "$command" == 2 ]];then
                    break
                fi
            else 
                printf "\033c" 
                printf "\e[31mPlease enter a valid Command\e[0m\n"
            fi
        done
    fi
}

######################################################################################

###################################  FILTER   ########################################

#Handles the timestamp range to be considered by taking input start and end time from user and validating it
timestamp_range(){
    printf "\e[35mEnter the range of timestamps\n"
    printf "Enter the  timestamp in the format ( YYYY-MM-DD HH:MM:SS )\n\e[0m"
    local attempt=0

    #Takes start time as an input
    while true ;do
        read -er -p $'\001\e[33m\002Start Time : \001\e[0m\002' start_time
        
        if valid_command_default "$start_time"; then
        #takes the earliest game time as selected time if procedding by default 
            start_time="$first_game_time"
            break
        elif valid_command_quit "$start_time"; then
            return 1
        elif ! Validate_Timestamp "$start_time" ; then
        #clears the error message and input prompt to reprint the prompt
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi
        #error message to be printed if input is not a valid timestamp
            printf "\e[31mEnter a valid Timestamp\n\e[0m"
        else
            break
        fi
        attempt=1
    done

    #Takes end time as an input
    attempt=0
    while true ;do
        read -er -p $'\001\e[33m\002End Time : \001\e[0m\002' end_time

        if valid_command_default "$end_time";then
        #takes the last game time as selected time if procedding by default
            end_time="$last_game_time"
            break
        elif valid_command_quit "$end_time"; then
            return 1
        elif ! Validate_Timestamp "$end_time" ; then
            #clears the error message and input prompt to reprint the prompt
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi

            #error message to be printed if input is not a valid timestamp
            printf "\e[31mEnter a valid Timestamp\n\e[0m"
        else
            break
        fi
        attempt=1
    done    

    #if End time is less than start time than it throws an error message
    if [[ "$end_time" < "$start_time" ]];then
        printf "\033c"
        printf "\e[31mEnd time should be greater than or equal to start time\n\e[0m"
        return 1
    fi
}

######################################################################################


############################### DELETE FUNCTIONS #####################################

#deletes entries from history.txt of specified user
#takes username as an argument
remove_entries_user(){
    awk -F "," -v user="$1" '
        {
            if (NR==1) {print $0}
            else if($2 != user){
                print $0
            }
        }' history.txt > history.tmp
    
    mv history.tmp history.txt
    
    printf "\033c"
    printf "\e[32mhistory.txt has been updated\e[0m\n"
    update_stats
}

#deletes entries from history.txt of specified time range
#takes 2 arguments --> Start time and End time
remove_entries_timestamp(){
    awk -F "," -v start="$1" -v end="$2" '{
        if(NR == 1){print $0}
        else {
        #extracts timestamp without brackets from first field of timestamp 
            timestamp = $1
        #substitute bracket to no character to remove it
            sub(/^\[/, "", timestamp) 
            sub(/\]$/, "", timestamp)
        #remove those arguments which are not in range
            if(timestamp < start || timestamp > end){
                print $0
            }
        }
    }' history.txt > history.tmp
    mv history.tmp history.txt
    printf "\e[32mhistory.txt has been updated\e[0m\n"
    update_stats
}

#validates and ask for confirmation for deletion of records from history.txt based on specified user
delete_user(){
    local attempt=0
    while true; do
        read -er -p $'\001\e[33m\002Specify a User : \001\e[0m\002' player
        if valid_command_quit "$player"; then
            return 1
        elif [[ "$player" != "" ]] && valid_user "$player" ; then
            break
        else
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi            
            printf "\e[31mEnter a valid username\n\e[0m"
        fi
        attempt=1
    done

    attempt=0
    while true; do
        read -ern 1 -p $'\001\e[31m\002Are you sure you want to delete these entries ? (y/n) - \001\e[0m\002' confirmation
        if valid_command_quit "$confirmation"; then
            return 1
        elif [[ $confirmation == "y" ]]; then
            remove_entries_user "$player"
            break
        elif [[ "$confirmation" == "n" ]];then 
            printf "\033c"
            return 0
        else
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi            
            printf "\e[31mEnter a valid command\n\e[0m"
        fi
        attempt=1
    done
}

#validates and ask for confirmation for deletion fo records from history.txt in specifed time range
delete_timestamps(){
    #takes input range and checks if it is valid
    if ! timestamp_range;then
        return 1
    fi

    attempt=0
    while true; do
        read -ern 1 -p $'\001\e[31m\002Are you sure you want to delete the records? (y/n) \001\e[0m\002' confirmation
        if valid_command_quit "$confirmation";then
            return 1
        elif [[ "$confirmation" == "n" ]]; then
            printf "\033c"
            return 0
        elif [[ "$confirmation" == "y" ]]; then
            #remove entries from start time and end time specified in timestamp_range function invoked above
            remove_entries_timestamp "$start_time" "$end_time"
            break
        else 
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi
            printf "\e[31mPlease Enter a Valid Command\n\e[0m"
        fi    
        attempt=1 
    done    
    printf "\033c"   
}

#deletes tehe misformatted records from history.txt
delete_misformatted_records(){
    attempt=0
    while true; do
        read -ern 1 -p $'\001\e[31m\002Are you sure you want to delete the records? (y/n) \001\e[0m\002' confirmation
        if valid_command_quit "$confirmation";then
            return 1
        elif [[ "$confirmation" == "n" ]]; then
            printf "\033c"
            return 0
        elif [[ "$confirmation" == "y" ]]; then

        #copy valid entries from history.txt to history.tmp and then overwrite history.txt
            awk -F "," '{
                if (NR==1){print $0}
                #checks the regex
                else if ($0 ~ /^\[[0-9]+-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]\],[a-zA-Z0-9_]+,[0-9]+,[A-Z]+,[0-9]+[.]?[0-9]*$/) {
                    line=$0
                #removes brackets from timstamp in first field of entries 
                    t_stamp=$1
                #returns an array from the fields separated by separator in given string 
                #split(string, array, separator)
                    split(t_stamp,a,"]"); 
                    split(a[1],b,"[");
                #system command uses date function of bash to validate time stamp
                    if (!system("date -d \"" b[2] "\" \"+%Y-%m-%d %H:%M:%S\" >/dev/null 2>&1")){
                    #checks if cause of death is wall and self
                        if ($4 !~ /(WALL|SELF)/){}
                        else {print line}
                    }                
                }
            }' history.txt > history.tmp

            #overwrite history.txt from history.tmp
            mv history.tmp history.txt
            printf "\n" >> history.txt
            printf "\033c"
            printf "\e[32mNo misformated Records Remains\e[0m\n"
            printf "\e[32mhistory.txt has been updated\e[0m\n"
            update_stats
            break
        else 
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi
            printf "\e[31mPlease Enter a Valid Command\n\e[0m"
        fi    
        attempt=1 
    done    

}

#Ask user for method by which they want to delete entries from history.txt
Delete_Entries(){
    printf "\033c"

    #array of functions which are to be called based on option selected
    local delete_methods=("delete_user" "delete_timestamps" "delete_misformatted_records")
    while true; do

        #list of available options
        options=("1] Specific User" "2] Timestamp" "3] Misformatted Records")

        #displays option in dynamic tabular format 
        tabular_display

        read -ern 1 -p $'\001\e[33m\002Choose a method to delete : \001\e[0m\002' method
        if valid_command_quit "$method"; then
            return 1
        elif valid_command 3 $method; then
            break
        else 
            printf "\033c" 
            printf "\e[31mPlease enter a valid Command\e[0m\n"
        fi
    done

    #calls the delete method based on input command by mapping it to list of functions mentioned in delete_methods
    ${delete_methods[$method-1]}
}

######################################################################################

################################   LOG MANAGEMENT  ###################################

#create a backup log file
backup_logs(){
    #remove empty lines , first line(heading) and last 10 entries from sorted history.txt
    grep -vE "^$" history.txt | sort | tail -n +2 | tail -10 > history.tmp

    #make a folder backup for storing backups
    mkdir -p backup

    #compress the file 
    tar -czf ./backup/history.tar.gz history.txt

    #overwrite history.txt by using first line(heading) and the last 10 records stored above
    (echo "$first_line"; cat history.tmp) > history.txt

    #appends empty line to history.txt to match standard format of history.txt
    printf "\n" >> history.txt
    rm history.tmp
    printf "\033c"
    printf "\e[32mLogs have been backed up\e[0m\n"
    printf "\e[32mHistory.txt has been updated\e[0m\n"
}

#Perform Log Rotation by saving last 10 entries of history.txt
Log_Rotation(){
    local attempt=0
    while true; do
    #asks for confirmation from user as it is going to update history.txt
        read -er -n 1 -p $'\001\e[31m\002Are you sure you want to Backup Logs and update your history.txt? (y/n) \001\e[0m\002' confirmation
            if valid_command_quit "$confirmation";then
                return 1
            elif [[ "$confirmation" == "n" ]]; then
                printf "\033c"
                return 1
            elif [[ "$confirmation" == "y" ]]; then
            #if there already exist a backup then asks the user to confirm if they want to overwrite the backup
                if [[ -f ./backup/history.tar.gz ]];then
                    local attemp=0
                    while true;do
                        read -ern 1 -p $'\001\e[33m\002A backup file already exist.\nDo you want to overwrite it? (y/n) \001\e[0m\002' input
                        if valid_command_quit "$input"; then
                            return 1
                        elif [[ "$input" == "n" ]];then
                            printf "\033c"
                            return 1
                        elif [[ "$input" == "y" ]];then
                        #if user confirms than overwrites original backup and update history.txt
                            backup_logs
                            return 0
                        else
                            if [[ "$attemp" -eq 0 ]];then
                                printf "\e[1A\e[2K"
                                printf "\e[1A\e[2K"
                            else 
                                printf "\e[1A\e[2K"
                                printf "\e[1A\e[2K"
                                printf "\e[1A\e[2K"
                            fi 
                            printf "\e[31mEnter a Valid Command\e[0m\n"
                        fi                      
                        attemp=1
                    done
                else
                #if no backup files exist then creates a backup file
                    backup_logs
                    break
                fi
            else
                if [[ "$attempt" -eq 0 ]];then
                    printf "\e[1A\e[2K"
                else 
                    printf "\e[1A\e[2K"
                    printf "\e[1A\e[2K"
                fi 
                printf "\e[31mEnter a Valid Command\e[0m\n"
            fi
        attempt=1
    done
}

#Restore backup log files into current history.txt while keeping old entries and appending new ones to it
Restore_Logs(){
    #if no backup file exist then states the error and exit function
    [ ! -f "./backup/history.tar.gz" ] && printf "\033c" && printf "\e[31mNo Stored Logs Found\e[0m\n" && return 1

    #if backup logs exist then ask for confirmation
    if [[ -f ./backup/history.tar.gz ]];then

        local attempt=0
        while true ;do
            read -ern 1 -p $'\001\e[33m\002Do you want to restore logs? (y/n) \001\e[0m\002' confirmation
            if valid_command_quit "$confirmation"; then
                return 1
            elif [[ "$confirmation" == "n" ]]; then
                printf "\033c"
                return 1
            elif [[ "$confirmation" == "y" ]]; then
                #rename history.txt to history.tmp
                mv history.txt history.tmp

                #extract the backup with output file name history.txt 
                tar -xzf "./backup/history.tar.gz"

                #append records of history.txt to old history
                cat history.txt >> history.tmp

                #prints first line(heading)
                #filters all non empty lines by grep -vE "^$" 
                #Removes duplicate entries by sort -u
                (echo "$first_line";grep -vE "^$" history.tmp | grep -v "$first_line" | sort -u ) > history.txt
                rm history.tmp

                #if last line of history.txt is not empty then append a newline to maintain consistency
                local last=$(tail -1 history.txt )
                if [[ ! -z "$last" ]];then
                    printf "\n" >> history.txt
                fi

                printf "\033c"
                printf "\e[32mRestored Log File\e[0m\n"
                break
            else
                if [[ "$attempt" -eq 0 ]];then
                    printf "\e[1A\e[2K"
                else 
                    printf "\e[1A\e[2K"
                    printf "\e[1A\e[2K"
                fi
                printf "\e[31mEnter a Valid Commnad\n\e[0m"
            fi
            attempt=1
        done
    fi

}

######################################################################################

#################################  ANALYTICS  ########################################

#calculate and display records for anlaytics of all users/ specific user for games played by them
#takes input a file as an argument
calculate_records(){
    awk -F "," '
        BEGIN {
        #initialize array to store cause of death of user(s)
            death["SELF"]=0
            death["WALL"]=0
        }
        {
        #stores score,time survived
            score+=$3
            time+=$5
            death[$4]+=1
        
        #stors the detail of max score bearers in a 2D array with 1st entry being username and second field
        #the input comes in sorted format of score so the function is implemented accordingly
            if($3>=max_score){
                max_score=$3
                for(j=1;j<6;j++){
                    max_score_detail[$2,j]=$j
                }
        #stores all usernames
                entries[NR]=$2
        #count total no.of top score bearers
                count++
            }
        }
        END {
        #fraction of wall death
            fraction=death["WALL"]/(death["WALL"] + death["SELF"])

        #printing all stats

            printf "\n╔══════════════════════════════╗\n"
            printf "║        STATISTICS            ║\n"
            printf "╠═══════════════╦══════════════╣\n"
            printf "║ Average Score ║ %-12s ║\n", score/NR
            printf "╠═══════════════╬══════════════╣\n"
            printf "║ Average Time  ║ %-12s ║\n", time/NR
            printf "╠═══════════════╬══════════════╣\n"
            printf "║ Max Score     ║ %-12s ║\n", max_score
            printf "╚═══════════════╩══════════════╝\n\n"
            
            printf "╔════════════════════╦═══════════╦═══════════╗\n"
            printf "║%-20s║ %-10s║ %-10s║\n", "CAUSE_OF_DEATH", "SELF", "WALL"
            printf "╠════════════════════╬═══════════╬═══════════╣\n"
            printf "║%-20s║ %-10s║ %-10s║\n", "COUNTS", death["SELF"], death["WALL"]
            printf "╠════════════════════╩═══════════╬═══════════╣\n"
            printf "║%-32s║ %-10s║\n","FRACTION_OF_WALL_DEATHS",fraction
            printf "╚════════════════════════════════╩═══════════╝\n\n"

        #printing entries of top score beares
            printf "╔═══════════════════════════════════════════════════════════════════════════╗\n"
            printf "║\t\t\tLIST OF ENTRIES WITH MAX SCORE\t\t\t    ║\n"
            printf "╠═════════════════════╦═══════════════════╦══════╦══════╦═══════════════════╣\n"
            printf "║%-21s║ %-18s║ %-5s║ %-5s║ %-18s║\n","START_TIME","USERNAME","SCORE","DEATH","TIME_ALIVE"
            printf "╠═════════════════════╬═══════════════════╬══════╬══════╬═══════════════════╣\n"
            for(j in entries){
                printf "║%-21s║ %-18s║ %-5s║ %-5s║ %-18s║\n",max_score_detail[entries[j],1],max_score_detail[entries[j],2],max_score_detail[entries[j],3],max_score_detail[entries[j],4],max_score_detail[entries[j],5]
                for(k=1;k<6;k++){
                    max_score_detail[entries[j],k]
                }
                if(count != 1){
                    printf "╠═════════════════════╬═══════════════════╬══════╬══════╬═══════════════════╣\n"
                    count--
                }
            }
            printf "╚═════════════════════╩═══════════════════╩══════╩══════╩═══════════════════╝\n"
        }
        ' | less
    printf "\033c"
}

#Analyse the data of player(s) across all games played
Analytics(){
    printf "\033c"
    local attempt=0    
    while true; do
    #ask for method of filtering the analysis
        read -ern 1 -p $'\001\e[33m\002Do you want to view filter analysis based on timestamp or view for entire file? (1/2) \001\e[0m\002' input
        if valid_command_quit "$input";then
            return 1
        elif ! valid_command 2 "$input";then
            printf "\033c"
            printf "\e[31mEnter a valid Command\n\e[0m"
        else
            break
        fi
        attempt=1
    done
    
    #sort -rk 3,3 is done to pass the records in reverse order of score
    if [[ "$input" == 2 ]]; then
        if [[ "$user" == "" ]]; then
            #pass all records except empty line and heading
            grep -vE "^$" history.txt |tail -n +2 | sort -rnt "," -k 3,3 | calculate_records 
        else
            #pass records of specific user without empty lines and heading 
            grep -vE "^$" history.txt |tail -n +2 | grep ",$user," | sort -rnt "," -k 3,3 | calculate_records
        fi
    
    elif [[ "$input" == 1 ]]; then
        #takes timestamp input
        #uses error code of timestamp range to exit or continue in the current function
        if ! timestamp_range; then
            return 1
        else
        #start time and end time are taken as input in timestamp_range
            awk -F "," -v start="$start_time" -v end="$end_time" '{
                if(NR == 1){print $0}
                else {
                #substitute brackets to gain only the timestamp
                    timestamp = $1
                    sub(/^\[/, "", timestamp)
                    sub(/\]$/, "", timestamp)
                #filtering all entries that lie between the the specified timestamps
                    if(timestamp >= start && timestamp <= end){
                        print $0
                    }
                }
            #creates a copy of history.txt with required entries only
            }' history.txt > history.tmp

            #sort -rk 3,3 is done to pass the records in reverse order of score
            #if no.of lines in file is 1 indicates that it as only header file and hence no other records for given user in selected time range
            if [[ $(grep -nv -E "^$" history.tmp | wc -l | cut -d " " -f 1) -eq 1 ]];then
                printf "\e[31mNo data for selected user and time range found\n\e[0m"
            elif [[ "$user" == "" ]]; then
                #pass all records except heading from the copy of file created 
                tail -n +2 history.tmp | sort -rnt "," -k 3,3 | calculate_records 
            else
                #pass all records except heading from the copy of file created for the user selected
                tail -n +2 history.tmp | grep ",$user," | sort -rnt "," -k 3,3 | calculate_records
            fi
            rm history.tmp
        fi
    fi
}

######################################################################################

###############################   FEATURE FUNCTION  ##################################

#Specifying user to be analysed
Query_User(){
    local attempt=0
    #take input of username of the user to be queried
    while true; do
    read -er -p $'\001\e[33m\002Enter Username : \001\e[0m\002' input
        if valid_command_quit "$input";then
            return 0
        elif valid_user "$input" ; then 
            if [[ "$input" == "" ]]; then {
            #default user is set to "all"
                user="$input"
                printf "\033c"
                printf "\e[32mAll Users Will be Queried\e[0m\n" 
            }
            #check in userlist for the username entered
            elif [[ $user_list =~ ":$input:" ]];then {
                user="$input"
                printf "\033c"
                printf "\e[32m$user Will be Queried\e[0m\n"
            }
            fi
            break    
        else
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi        
            printf "\e[31mPlease enter a valid Username\e[0m\n"
        fi
        attempt=1
    done
}

#View Score of recent games in a paginated view.
Recent_Score(){
    printf "\033c"
    if [ "$user" == "" ]; then {
        #passes heading and all other entries all users sorted in reverse order by time of game played to output_table
        (echo "$first_line";grep -vE "^$" history.txt |tail -n +2 |sort -r ) | output_table
    } else {
        #passes heading and all other entries of specified user sorted in reverse order by time of game played to output_table
        (echo "$first_line";grep -vE "^$" history.txt |tail -n +2 | sort -r ) | awk -F "," -v user="$user" '
            {
                if(NR ==1 ) {print $0}
                else if($2 == user){
                    printf $0 "\n"
                }
            }
        ' | output_table
    } fi
}

#View the logs sorted based on specific filters(time stamp as default.)
Sorted_View(){
    printf "\033c"
    local attempt=0
    #ask user for the filter to be applied while for seeing the records of the game
    while true; do 
        options=("1] User" "2] Time survived" "3] Score" "4] Time Stamp{default}")
        tabular_display
        read -er -n 1 -p $'\001\e[33m\002Select a specific feature to filter : \001\e[0m\002' key
        printf "\n"
        if valid_command_default "$key"; then
        #if input is set to default then set input to timestamp
            key=4
            break
        elif valid_command_quit "$key"; then
            return 1
        elif valid_command 4 $key; then
            break
        else 
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi 
            printf "\033c"
            printf "\e[31mEnter a Valid Command\e[0m\n"
        fi
        attempt=1
    done

    #Sorting in ascending or descending order based on user's choice (ascending is default)
    #If user is specified in the query user then only records of that user will be displayed else all records will be displayed
    if [[ "$key" == '1' ]];then 
        local attempt=0
        while true;do
            read -ern 1 -p $'\001\e[33m\002Sort by\nAscending order\001\e[37m\002 {default} \001\e[33m\002(1)\nDescending order (2) : \001\e[0m\002' command
            if valid_command_default "$command";then
                command=1
                break
            elif valid_command_quit "$command"; then
                return 1
            elif valid_command 2 "$command"; then
                break
            else
                if [[ "$attempt" -eq 0 ]];then
                    printf "\e[1A\e[2K"
                    printf "\e[1A\e[2K"
                    printf "\e[1A\e[2K"
                else 
                    printf "\e[1A\e[2K"
                    printf "\e[1A\e[2K"
                    printf "\e[1A\e[2K"
                    printf "\e[1A\e[2K"
                fi        
                printf "\e[31mEnter a Valid Command\e[0m\n"
            fi        
            attempt=1
        done
        if [[ "$command" == 2 ]];then {
            #outputs the top line of history.txt and then sort and then send both to output table
            #sort first by user then score then time survived then timestamp
            #sort in descending order of name
            { echo "$first_line";grep -vE "^$" history.txt | tail -n +2 | sort -fbdr -t "," -k2,2 -k3,3nr -k5,5 ;} | output_table 
        } elif [[ "$command" == 'q' ]];then {
            printf "\033c"
            return
        } else {
            #sort in ascending order of name 
            { echo "$first_line";grep -vE "^$" history.txt | tail -n +2 | sort -fbd -t "," -k2,2 -k3,3nr -k5,5 ;} | output_table
        }
        fi
    #soet by time survived
    elif [[ "$key" == '2' ]];then {
        { echo "$first_line";grep -vE "^$" history.txt |tail -n +2 | sort -rnt "," -k 5,5;} | output_table
    } elif [[ "$key" == '3' ]];then {
    #sort by score
        { echo "$first_line";grep -vE "^$" history.txt |tail -n +2 | sort -rnt "," -k 3,3;} | output_table
    } elif [[ "$key" == "4" ]];then {
    #sort by timestamp
        { echo "$first_line";grep -vE "^$" history.txt |tail -n +2 |sort -rt "," -k 1;} | output_table
    } fi 

    printf "\033c"
}  

######################################################################################

###############################   MENU DISPLAY   #####################################

#Displays menu with selectable operations on terminal.
menu_display(){

    #Different type of operations that can be performed from menu.
    operation=("Query_User" "Recent_Score" "Analytics" "Delete_Entries" "Log_Rotation" "Restore_Logs" "Sorted_View" "Exit")

    while true; do
        #options to be displayed in menu stored as an array
        options=("1] Query about a Specific User" "2] View scores of recent games" "3] View Analytics" "4] Delete Entries" "5] Log Rotation" "6] Restore Logs" "7] Sorted View" "8] Exit")
        tabular_display
        read -ern 1 -p $'\001\e[33m\002Enter command : \001\e[0m\002' command #bash does not interpret escaping inside "" but understands it in $''

        if [[ "$command" == 'q' ]]; then
            Exit
        elif valid_command ${#options[@]} $command; then
            break
        else 
            printf "\033c" 
            printf "\e[31mPlease enter a valid Command\e[0m\n"
        fi
    done
    #maps input to options displayed and calls the relevant function from operations array
    ${operation[$command - 1]}
}

######################################################################################

#initializes the script
init(){
    printf "\033c"
    history -c #prevents terminal history to be accessed in the process

    #if files does not exist then exit
    [ ! -f "history.txt" ] && printf "\033c" && printf "\e[31mhistory.txt file not found.\e[0m\n" && exit

    #if first line of file does not match the desired format then exit
    [[ $(head -1 history.txt) != "$first_line" ]] && printf "\033c" && printf "\e[31mInvalid file format.\e[0m\n" && exit

    #if file has misformatted records then handle it to use functions of the script
    handle_misformatted_records

    #update stats from history.txt
    update_stats

    #Display menu untill not exited
    while true; do
        menu_display
    done
}

init