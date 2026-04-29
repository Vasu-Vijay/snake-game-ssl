#/bin/bash

############################### GLOBAL VARIABLES ###################################

#Specified Current User/Users being analysed.
user=""
#Different type of operations that can be performed from menu.
operation=("Query_User" "Recent_Score" "Analytics" "Delete_Entries" "Log_Rotation" "Restore_Logs" "Sorted_View" "Exit")
#first line of history.txt
first_line="start_time,username,score,cause,time_alive"
#To be used to store all users in history.txt

#####################################################################################

##################################### UTILITY #######################################

#Exit the menu
Exit(){
    printf "\033c"
    rm -f misformatted.tmp history.tmp
    exit
}
check_history(){
    if [[ $(grep -nv -E "^$" history.txt | wc -l | cut -d " " -f 1) -eq 1 ]];then
        if [[ -f history.tar.gz ]];then
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
update_stats(){
    check_history
    first_game_time=$(grep -vE "^$" history.txt |tail -n +2 | sort | head -1 | cut -d "]" -f1 | cut -d "[" -f2)
    last_game_time=$(grep -vE "^$" history.txt |tail -n +2 | sort | tail -1 | cut -d "]" -f1 | cut -d "[" -f2)
    user_list=":$(grep -vE "^$" history.txt |tail -n +2 | cut -d',' -f2 | sort -u | tr '\n' ':' )"
    if [[ "$user" == "" || "$user_list" =~ ":$user:" ]]; then # *""* does literal match i.e. avoids regex if any in the ""
        :
    else
        user=""
        printf "\e[32mSelected User has been changed to all due to no remaining records of previously chosen user\n\e[0m"
    fi
}
#####################################################################################

#################################### VALIDATION ####################################

#To be used to validate if command entered is correct or not
valid_command(){
    if [[ "$2" =~ ^[1-$1]$ ]]; then 
        return 0
    else 
        return 1
    fi 
}

valid_command_quit(){
    if [[ "$1" == "q" ]];then
        printf "\033c"
        menu_display
        return 0
    else
        return 1
    fi
}

valid_command_default(){
    if [[ "$1" == "" ]];then
        return 0
    else
        return 1
    fi
}
#To be used to validate if user has input valid user or not
valid_user(){
    if [[ $user_list =~ ":$1:" || "$1" == "" ]]; then
        return 0
    else 
        return 1
    fi
}

#To be used to validate timestamp
Validate_Timestamp(){
    if [[ "$*" =~ ^[0-9]+-[0-9]{2}-[0-9]{2}\ [0-9]{2}:[0-9]{2}:[0-9]{2}$ ]]; then
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

#Used to display Menu in a tabluar form which is compatible with size of terminal
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

        for col in "${data_row[@]}"
        do
            lines=()
                while read -e -r line; do
                    lines+=("$line")
                done < <(wrap_text "$col")
            wrapped+=("$(printf "%s\n" "${lines[@]}")")
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

        for ((line=0; line<maxlines_block+1; line++))
        do
            printf "│"
            for ((j=0; j<COLS; j++))
            do
                # Extract this block's lines
                IFS=$'\n' read -e -d '' -r -a block_lines <<< "${wrapped[j]}" #-d is important as otherwise read -eing stops at even spaces
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
    
    #Prints the border of table
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
    for ((i=0; i<${#options[@]}; i+=COLS))
    do
        if [ $i == 0 ]; then
            print_border_top
        else
            print_border
        fi
        row=()
        for ((j=0; j<COLS; j++))
        do
            row+=("${options[i+j]}")
        done
        print_row "${row[@]}"
        
    done
    print_border_bottom
}

output_table(){ 
    #column -t -R 1,2,3,4,5 -s ","  -o " │ " |awk -F "│" '
    awk -F "," '
    {
        lines[NR] = $0
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


view_misformatted_records(){
    less -N misformatted.tmp
}

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

handle_misformatted_records(){
    check_misformatted
    local lines=$(grep -nvE "^$" misformatted.tmp | wc -l | cut -d " " -f1)
    if [[ "$lines" -ne 1 ]]; then
        misformat_options=("view_misformatted_records" "delete_misformatted_records" "Exit")
        while true; do
            printf "\033c"
            printf "\e[31mThere are misformatted records in history.txt. Choose a further course of action\e[0m\n"
            options=("1] View misformatted records" "2] Delete Misformatted Records" "3] Exit")
            tabular_display
            read -ern 1 -p $'\001\e[33m\002Enter command : \001\e[0m\002' command #bash does not interpret escaping inside "" but understands it in $''

            if [[ "$command" == 'q' ]]; then
                Exit
            elif valid_command ${#options[@]} $command; then
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

timestamp_range(){
    printf "\e[35mEnter the range of timestamps\n"
    printf "Enter the  timestamp in the format ( YYYY-MM-DD HH:MM:SS )\n\e[0m"
    local attempt=0
    while true ;do
        read -er -p $'\001\e[33m\002Start Time : \001\e[0m\002' start_time
        if valid_command_default "$start_time"; then
            start_time="$first_game_time"
            break
        elif valid_command_quit "$start_time"; then
            return 1
        elif ! Validate_Timestamp "$start_time" ; then
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi
            printf "\e[31mEnter a valid Timestamp\n\e[0m"
        else
            break
        fi
        attempt=1
    done
    attempt=0
    while true ;do
        read -er -p $'\001\e[33m\002End Time : \001\e[0m\002' end_time
        if valid_command_default "$end_time";then
            end_time="$last_game_time"
            break
        elif valid_command_quit "$end_time"; then
            return 1
        elif ! Validate_Timestamp "$end_time" ; then
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[2K"
            else 
                printf "\e[1A\e[2K"
                printf "\e[1A\e[2K"
            fi
            printf "\e[31mEnter a valid Timestamp\n\e[0m"
        else
            break
        fi
        attempt=1
    done    

    if [[ "$end_time" < "$start_time" ]];then
        printf "\033c"
        printf "\e[31mEnd time should be greater than or equal to start time\n\e[0m"
        return 1
    fi
}

######################################################################################


############################### DELETE FUNCTIONS #####################################

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
remove_entries_timestamp(){
    awk -F "," -v start="$1" -v end="$2" '{
        if(NR == 1){print $0}
        else {
            timestamp = $1
            sub(/^\[/, "", timestamp)
            sub(/\]$/, "", timestamp)
            if(timestamp < start || timestamp > end){
                print $0
            }
        }
    }' history.txt > history.tmp
    mv history.tmp history.txt
    printf "\e[32mhistory.txt has been updated\e[0m\n"
    update_stats
}
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
delete_timestamps(){
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
            awk -F "," '{
                if (NR==1){print $0}
                else if ($0 ~ /^\[[0-9]+-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]\],[a-zA-Z0-9_]+,[0-9]+,[A-Z]+,[0-9]+[.]?[0-9]*$/) {
                    line=$0
                    t_stamp=$1
                    split(t_stamp,a,"]");
                    split(a[1],b,"[");
                    if (!system("date -d \"" b[2] "\" \"+%Y-%m-%d %H:%M:%S\" >/dev/null 2>&1")){
                        if ($4 !~ /(WALL|SELF)/){}
                        else {print line}
                    }                
                }
            }' history.txt > history.tmp
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
Delete_Entries(){
    printf "\033c"

    local delete_methods=("delete_user" "delete_timestamps" "delete_misformatted_records")
    while true; do
        options=("1] Specific User" "2] Timestamp" "3] Misformatted Records")
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

    ${delete_methods[$method-1]}
}
######################################################################################

################################   LOG MANAGEMENT  ###################################

backup_logs(){
    grep -vE "^$" history.txt | tail -n +2 | tail -10 > history.tmp
    mkdir -p backup
    tar -czf ./backup/history.tar.gz history.txt
    (echo "$first_line"; cat history.tmp) > history.txt
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
        read -er -n 1 -p $'\001\e[31m\002Are you sure you want to Backup Logs and update your history.txt? (y/n) \001\e[0m\002' confirmation
            if valid_command_quit "$confirmation";then
                return 1
            elif [[ "$confirmation" == "n" ]]; then
                printf "\033c"
                return 1
            elif [[ "$confirmation" == "y" ]]; then
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

#Restore previous log files
Restore_Logs(){

    [ ! -f "./backup/history.tar.gz" ] && printf "\033c" && printf "\e[31mNo Stored Logs Found\e[0m\n" && return 1

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
                mv history.txt history.tmp
                tar -xzf "./backup/history.tar.gz"
                cat history.txt >> history.tmp
                (echo "$first_line";grep -vE "^$" history.tmp | grep -v "$first_line" | sort -u ) > history.txt
                rm history.tmp
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

calculate_records(){
    awk -F "," '
        BEGIN {
            death["SELF"]=0
            death["WALL"]=0
        }
        {
            score+=$3
            time+=$5
            death[$4]+=1
            if($3>=max_score){
                max_score=$3
                for(j=1;j<6;j++){
                    max_score_detail[$2,j]=$j
                }
                entries[NR]=$2
                count++
            }
        }
        END {
            if(death["SELF"] == 1){
                fraction=1
            } else {
                fraction=death["WALL"]/(death["WALL"] + death["SELF"])
            }

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

#Analyse the data of players of all games
Analytics(){
    printf "\033c"
    local attempt=0    
    while true; do
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
    
    if [[ "$input" == 2 ]]; then
        if [[ "$user" == "" ]]; then
            grep -vE "^$" history.txt |tail -n +2 | sort -rnt "," -k 3,3 | calculate_records 
        else
            grep -vE "^$" history.txt |tail -n +2 | grep ",$user," | sort -rnt "," -k 3,3 | calculate_records
        fi
    elif [[ "$input" == 1 ]]; then
        if ! timestamp_range; then
            return 1
        else
            awk -F "," -v start="$start_time" -v end="$end_time" '{
                if(NR == 1){print $0}
                else {
                    timestamp = $1
                    sub(/^\[/, "", timestamp)
                    sub(/\]$/, "", timestamp)
                    if(timestamp >= start && timestamp <= end){
                        print $0
                    }
                }
            }' history.txt > history.tmp
            if [[ $(grep -nv -E "^$" history.tmp | wc -l | cut -d " " -f 1) -eq 1 ]];then
                printf "\e[31mNo data for selected user and time range found\n\e[0m"
            elif [[ "$user" == "" ]]; then
                tail -n +2 history.tmp | sort -rnt "," -k 3,3 | calculate_records 
            else
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
    while true; do
    read -er -p $'\001\e[33m\002Enter Username : \001\e[0m\002' input
        if valid_command_quit "$input";then
            return 0
        elif valid_user "$input" ; then 
            if [[ "$input" == "" ]]; then {
                user="$input"
                printf "\033c"
                printf "\e[32mAll Users Will be Queried\e[0m\n" 
            }
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
#View Recent Scores of game in a paginated view.
Recent_Score(){
    printf "\033c"
    if [ "$user" == "" ]; then {
        (echo "$first_line";grep -vE "^$" history.txt |tail -n +2 |sort -r ) | output_table
    } else {
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
    while true; do 
        options=("1] User" "2] Time survived" "3] Score" "4] Time Stamp{default}")
        tabular_display
        read -er -n 1 -p $'\001\e[33m\002Select a specific feature to filter : \001\e[0m\002' key
        printf "\n"
        if valid_command_default "$key"; then
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
            { echo "$first_line";grep -vE "^$" history.txt | tail -n +2 | sort -fbdr -t "," -k2,2 -k3,3nr -k5,5 ;} | output_table 
        } elif [[ "$command" == 'q' ]];then {
            printf "\033c"
            return
        } else {
            { echo "$first_line";grep -vE "^$" history.txt | tail -n +2 | sort -fbd -t "," -k2,2 -k3,3nr -k5,5 ;} | output_table
        }
        fi
    elif [[ "$key" == '2' ]];then {
        { echo "$first_line";grep -vE "^$" history.txt |tail -n +2 | sort -rnt "," -k 5,5;} | output_table
    } elif [[ "$key" == '3' ]];then {
        { echo "$first_line";grep -vE "^$" history.txt |tail -n +2 | sort -rnt "," -k 3,3;} | output_table
    } elif [[ "$key" == "4" ]];then {
        { echo "$first_line";grep -vE "^$" history.txt |tail -n +2 |sort -rt "," -k 1;} | output_table
    } fi 

    printf "\033c"
}  

######################################################################################

###############################   MENU DISPLAY   #####################################

#Displays menu with selectable operations on terminal.
menu_display(){
    while true; do
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
    ${operation[$command - 1]}
}

######################################################################################

init(){
    printf "\033c"
    history -c #prevents terminal history to be accessed in the process

    
    [ ! -f "history.txt" ] && printf "\033c" && printf "\e[31mhistory.txt file not found.\e[0m\n" && exit
    [[ $(head -1 history.txt) != "$first_line" ]] && printf "\033c" && printf "\e[31mInvalid file format.\e[0m\n" && exit
    handle_misformatted_records
    update_stats


    #Display menu untill not exited
    while true; do
        menu_display
    done
}

init