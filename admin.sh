#/bin/bash


#Specified Current User/Users being analysed.
user=""
#Different type of operations that can be performed from menu.
operation=("Query_User" "Recent_Score" "Analytics" "Delete_Entries" "Log_Rotation" "Restore_Logs" "Sorted_View" "Exit")
#first line of history.txt
first_line="start_time,username,score,cause,time_alive"
#To be used to store all users in history.txt
update_stats(){
    first_game_time=$(tail -n +2 history.txt | sort | head -1 | cut -d "]" -f1 | cut -d "[" -f2)
    last_game_time=$(tail -n +2 history.txt | sort | tail -1 | cut -d "]" -f1 | cut -d "[" -f2)
    user_list=":$(tail -n +2 history.txt | cut -d',' -f2 | sort -u | tr '\n' ':' )"
}

#To be used to validate if command entered is correct or not
function valid_command(){
    
    if  valid_command_quit "$2" ;then
        return 0
    fi
    if [[ "$2" =~ ^[1-$1]$ || "$2" == $'\x1b' ]]; then 
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
function valid_user(){
    if valid_command_quit "$1";then
        return 0
    fi

    if [[ "$1" == $'\x1b' || $user_list =~ ":$1:" || "$1" == "" ]]; then
        return 0
    else 
        printf "\033c"
        printf "\e[31mPlease enter a valid Username / all\e[0m\n"
        return 1
    fi
}

#To be used to validate timestamp
function Validate_Timestamp(){
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
#Used to display Menu in a tabluar form which is compatible with size of terminal
function tabular_display(){
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

function output_table(){ 
    column -t -R 1,2,3,4,5 -s ","  -o " │ " |awk -F "│" '
    {
        lines[NR] = $0
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
            printf lines[l]
            printf "│\n"
            printf "├"
            for (i = 1; i <= 5; i++) {
                for (j = 1; j <= max_col[i]; j++) {printf "─"}
                if (i < 5) printf "┼"
            }
            printf "┤\n"
        }
        printf "│"
        printf lines[l]
        printf "│\n"
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

#Displays menu with selectable operations on terminal.
function menu_display(){
    while true; do
        options=("1] Query about a Specific User" "2] View scores of recent games" "3] View Analytics" "4] Delete Entries" "5] Log Rotation" "6] Restore Logs" "7] Sorted View" "8] Exit")
        tabular_display
        read -e -p $'\e[33mEnter command : \e[0m' command #bash does not interpret escaping inside "" but understands it in $''

        if valid_command ${#options[@]} $command; then
            break
        else 
            printf "\033c" 
            printf "\e[31mPlease enter a valid Command\e[0m\n"
        fi
    done
    ${operation[$command - 1]}
}

#Exit the menu
function Exit(){
    printf "\033c"
    exit
}

#Specifying user to be analysed
function Query_User(){
    
    while true; do
    read -e -p $'\e[33mEnter Username : \e[0m' input
        if valid_user "$input" ; then 
            if [[ "$input" == "" ]]; then {
                user="$input"
                printf "\e[32mAll Users Will be Queried\e[0m\n" 
            }
            elif [[ $user_list =~ ":$input:" ]];then {
                user="$input"
                printf "\e[32m$user Will be Queried\e[0m\n"
            }
            fi
            break        
        fi
    done
    printf "\033c"
}

#View Recent Scores of game in a paginated view.
function Recent_Score(){
    printf "\033c"
    if [ "$user" == "" ]; then {
        (echo "$first_line"; tail -n +2 history.txt |sort -r ) | output_table
    } else {
        (echo "$first_line"; tail -n +2 history.txt | sort -r ) | awk -F "," -v user="$user" '
            {
                if(NR ==1 ) {print $0}
                else if($2 == user){
                    printf $0 "\n"
                }
            }
        ' | output_table
    } fi
}

#Perform Log Rotation by saving last 10 entries of history.txt
function Log_Rotation(){
    tail -n +2 history.txt| tail -10 > history.tmp
    tar -czf history.tar.gz history.txt
    (echo "$first_line"; cat history.tmp) > history.txt
    
    printf "\033c"
    printf "\e[32mLogs have been backed up\e[0m\n"
}

#Restore previous log files
function Restore_Logs(){
    [ ! -f "history.tar.gz" ] && printf "\033c" && printf "\e[31mNo Stored Logs Found\e[0m\n"
    [ -f "history.tar.gz" ] && tar -xzf "history.tar.gz" && printf "\033c" && printf "\e[32mRestored Logs\e[0m\n"     
}

#View the logs sorted based on specific filters(time stamp as default.)
function Sorted_View(){
    printf "\033c"

    while true; do 
        options=("1] User" "2] Time survived" "3] Score" "4] Time Stamp{default}")
        tabular_display
        read -e -n 1 -p $'\e[33mSelect a specific feature to filter : \e[0m' key
        printf "\n"
        if valid_command_default "$key"; then
            key=4
            break
        elif valid_command 4 $key; then
            break
        else 
            printf "\033c" 
            printf "\e[31mPlease enter a valid Command\e[0m\n"
        fi
    done

    if [[ "$key" == '1' ]];then 
        while true;do
        read -e -p $'\e[33mSort in ascending order\e[37m {default} \e[33m(1) or Sort in descending order (2) : \e[0m' command
        echo "$command"
        if valid_command_default "$command";then
            command=1
            break
        elif valid_command 2 $command; then
            break
        else
            printf "\033c" 
            printf "\e[31mPlease enter a valid Command\e[0m\n"
        fi        
        done
        if [[ "$command" == 2 ]];then {
            #outputs the top line of history.txt and then sort and then send both to output table
            { echo "$first_line";tail -n +2 history.txt | sort -fbdr -t "," -k2,2 -k3,3nr -k5,5 ;} | output_table 
        } elif [[ "$command" == 'q' || "$command" == $'\x1b' ]];then {
            printf "\033c"
            return
        } else {
            { echo "$first_line";tail -n +2 history.txt | sort -fbd -t "," -k2,2 -k3,3nr -k5,5 ;} | output_table
        }
        fi
    elif [[ "$key" == '2' ]];then {
        { echo "$first_line";tail -n +2 history.txt | sort -rnt "," -k 5,5;} | output_table
    } elif [[ "$key" == '3' ]];then {
        { echo "$first_line";tail -n +2 history.txt | sort -rnt "," -k 3,3;} | output_table
    } elif [[ "$key" == "4" ]];then {
        { echo "$first_line";tail -n +2 history.txt |sort -rt "," -k 1;} | output_table
    } fi 

    printf "\033c"
}  

function calculate_records(){
    awk -F "," '{
            score+=$3
            time+=$5
            death[$4]+=1
            if($3>=max_score){
                max_score=$3
                max_score_detail[$2]=$0
            }
        }
        END {
            printf "average_score : " score/NR "\naverage_time : " time/NR "\nmax_score : " max_score "\n\n"
            printf"CAUSE_OF_DEATH :        "
            for(i in death){
                printf  i ":" death[i] "    " 
            }
            printf "\n\nList of Entries with Max Score\n\n"
            for(i in max_score_detail){
                print max_score_detail[i]
            }
        }
        ' | less
}
#Analyse the data of players of all games
function Analytics(){
    printf "\033c"
    if [[ "$user" == "" ]]; then
        tail -n +2 history.txt | sort -rnt "," -k 3,3 | calculate_records 
    else
        tail -n +2 history.txt | grep ",$user," | sort -rnt "," -k 3,3 | calculate_records
    fi
}

delete_user(){
     read -e -p $'\e[33mSpecify a User : \e[0m' player
        read -e -p $'\e[31mAre you sure you want to delete these entries ? (y/n) - \e[0m' confirmation
        if [[ $confirmation == "y" ]]; then
            awk -F "," -v user="$player" '
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
        else 
            printf "\033c"
            menu_display
        fi
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
}

delete_timestamps(){
    printf "\e[35mEnter the range of timestamps to delete entries\n"
    printf "Enter the  timestamp in the format ( YYYY-MM-DD HH:MM:SS )\n\e[0m"
    local attempt=0
    while true ;do
        read -e -p $'\e[33mStart Time : \e[0m' start_time
        if valid_command_default "$start_time"; then
            start_time="$first_game_time"
            break
        elif valid_command_quit "$start_time"; then
            return 0
        elif ! Validate_Timestamp "$start_time" ; then
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[K"
            else 
                printf "\e[2A\e[K"
            fi
            printf "\e[31mEnter a valid Timestamp\n\e[0m"
        else
            break
        fi
        attempt=1
    done
    attempt=0
    while true ;do
        read -e -p $'\e[33mEnd Time : \e[0m' end_time
        if valid_command_default "$end_time";then
            end_time="$last_game_time"
            break
        elif valid_command_quit "$end_time"; then
            return 0
        elif ! Validate_Timestamp "$end_time" ; then
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[K"
            else 
                printf "\e[2A\e[K"
            fi
            printf "\e[31mEnter a valid Timestamp\n\e[0m"
        else
            break
        fi
        attempt=1
    done    
    attempt=0
    while true; do
        read -e -p $'\e[31mAre you sure you want to delete the records? (y/n) \e[0m' confirmation
        if valid_command_quit "$confirmation";then
            return 0
        elif [[ "$confirmation" == "n" ]]; then
            printf "\033c"
            return 0
        elif [[ "$confirmation" == "y" ]]; then
            remove_entries_timestamp "$start_time" "$end_time"
            break
        else 
            if [[ "$attempt" -eq 0 ]];then
                printf "\e[1A\e[K"
            else 
                printf "\e[2A\e[K"
            fi
            printf "\e[31mPlease Enter a Valid Command\n\e[0m"
        fi    
        attempt=1 
    done    
    printf "\033c"   
}

delete_misformatted_records(){
    awk -F "," '{
        if (NR==1){print $0}
        else if ($0 ~ /^\[[0-9]+-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\],[^,]+,[0-9]+,[A-Z]+,[0-9]+[.]?[0-9]*$/) {
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
    printf "\033c"
    printf "\e[32mNo misformated Records Remains\e[0m\n"
}
#Delete Entries from history.txt
function Delete_Entries(){
    printf "\033c"

    local delete_methods=("delete_user" "delete_timestamps" "delete_misformatted_records")
    while true; do
        options=("1] Specific User" "2] Timestamp" "3] Misformatted Records")
        tabular_display
        read -e -p $'\e[33mChoose a method to delete : \e[0m' method

        if valid_command 3 $method; then
            break
        else 
            printf "\033c" 
            printf "\e[31mPlease enter a valid Command\e[0m\n"
        fi
    done

    ${delete_methods[$method-1]}
}

init(){
    [ ! -f "history.txt" ] && printf "\033c" && printf "\e[31mhistory.txt file not found.\e[0m\n" && exit
    [[ $(head -1 history.txt) != "$first_line" ]] && printf "\033c" && printf "\e[31mInvalid file format.\e[0m\n" && exit
    [[ $(head -1 history.txt) == "$first_line" ]] && [[ $(wc -l history.txt | cut -d " " -f 1) -eq 1 ]] && printf "\033c" && printf "\e[31mhistory.txt has no records stored.\e[0m\n" && exit
    update_stats
    history -c #prevents terminal history to be accessed in the process
    printf "\033c"
    #Display menu untill not exited
    while true; do
        menu_display
    done
}

init