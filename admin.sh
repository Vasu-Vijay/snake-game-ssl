#/bin/bash


#Specified Current User/Users being analysed.
user=all 
#Different type of operations that can be performed from menu.
operation=("Query_User" "Recent_Score" "Analytics" "Delete_Entries" "Log_Rotation" "Restore_Logs" "Sorted_View" "Exit")

#To be used to store all users in history.txt
function update_userlist(){
    user_list=":$(cut -d',' -f2 history.txt | sort -u | tr '\n' ':' )"
}

#To be used to validate if command entered is correct or not
function valid_command(){
    if [[ "$2" =~ ^[1-$1]$ || $2 == "q" || $2 == "\x1b" ]]; then 
        return 0
    else 
        return -1
    fi 
}

#To be used to validate if user has input valid user or not
function valid_user(){
    if [[ "$1" == "q" || "$1" == $'\x1b' || $user_list =~ ":$1:" || "$1" == "all" ]]; then
        return 0
    else 
        printf "\033c"
        printf "\e[31mPlease enter a valid Username / all\e[0m\n"
        return -1
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
    
    COL_WIDTH=$(($(tput cols) / COLS - 1)) #$COLUMNS does not work as it needs to be run in terminal. $tput cols handles it as long as terminal is active
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
    read -e -p $'\e[33mEnter Username : \e[0m' user
        if valid_user "$user" ; then 

            if [[ $user == "q" || $user == $'\x1b' ]]; then
                printf "\033c"
                menu_display
            elif [[ $user_list =~ ":$user:" || "$user" == "all" ]]; then
                break
            fi
        fi
    done
    printf "\033c"
    if [[ "$user" == "all" ]]; then {
        printf "\e[32mAll Users Will be Queried\e[0m\n" 
    }
    else {
        printf "\e[32m$user Will be Queried\e[0m\n"
        }
    fi
}

#View Recent Scores of game in a paginated view.
function Recent_Score(){
    printf "\033c"
    if [ "$user" == "all" ]; then {
        sort -r history.txt | less
    } else {
        sort -r history.txt | awk -F "," -v user="$user" '
            {
                if($2 == user){
                    printf $0 "\n"
                }
            }
        ' | less
    } fi
}

#Perform Log Rotation by saving last 10 entries of history.txt
function Log_Rotation(){
    tail -10 history.txt > history.tmp
    tar -czf history.tar.gz history.txt
    mv history.tmp history.txt
    
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
        options=("1] User" "2] Time survived" "3] Score")
        tabular_display
        read -e -n 1 -p $'\e[33mSelect a specific feature to filter : \e[0m' key
        printf "\n"
        if valid_command 3 $key; then
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
        if valid_command 2 $command; then
            break
        else
            printf "\033c" 
            printf "\e[31mPlease enter a valid Command\e[0m\n"
        fi        
        done
        if [[ "$command" == 2 ]];then
            sort -fbdr -t "," -k2,2 -k3,3nr -k5,5 history.txt | less
        elif [[ "$command" == 'q' || "$command" == $'\x1b' ]];then {
            printf "\033c"
            return
        } else {
            sort -fbd -t "," -k2,2 -k3,3nr -k5,5 history.txt | less
        }
        fi
    elif [[ "$key" == '2' ]];then {
        sort -rnt "," -k 5 history.txt | less
    } elif [[ "$key" == '3' ]];then {
        sort -rnt "," -k 3,3 history.txt | less
    } elif [[ "$key" == 'q' || "$key" == $'\x1b' ]];then {
        printf "\033c"
        menu_display
    } else {
        sort -rt "," -k 1 history.txt | less
    } fi 

    printf "\033c"
}  

#Analyse the data of players of all games
function Analytics(){
    printf "\033c"  
    if [[ $user != "all" ]]; then
        awk -F "," -v user="$user" '{
            if($2 == user){
                print $0
            }
        }' history.txt > history.tmp #created a history.tmp file to be used to read only specific users
    else 
        cp history.txt history.tmp #created a history.tmp file to match above format if all users are to be analysed
    fi
    #Showing Analysis of Games of the users
    sort -t "," -k 2 history.tmp | awk -F "," '
                {   
                    if(NR == 1){ 
                        if($0 ~ /^$/){
                            printf "No Records in history.txt"
                        } else {
                            printf "User ,  Avg_Score ,  Avg_Time_Survived ,  Min_Score ,  Max_Score\n"
                            cur_user=$2 ; score=$3 ; time=$5 ; death[$4]=1 ; min_score=score ; max_score=score ; games=1 ; min_score_detail=$0 ; max_score_detail=$0;
                        }
                    }
                    else if (cur_user != $2){
                        printf cur_user " ,\t"   score/games "  ,\t" time/games " ,\t" min_score " ,\t" max_score "\n"
                        printf "\t min_score : " min_score_detail "\n"
                        printf "\t max_score : " max_score_detail "\n"
                        printf "\n";
                        cur_user=$2
                        for (i in death){
                            death[i]=0
                        }
                        
                        score=$3 ; time=$5 ; death[$4]=1 ; min_score=score ; max_score=score ; games=1 ; min_score_detail=$0 ; max_score_detail=$0 ;
                    } else {
                        score+=$3 ; time+=$5 ; death[$4]+=1 ; games+=1 ;
                        if(min_score > $3) {
                            min_score=$3
                            min_score_detail=$0
                        }
                        if(max_score < $3) {
                            max_score=$3
                            max_score_detail=$0
                        }
                    }
                }
                END {
                    printf cur_user " , " score/games " , " time/games " , " min_score " , " max_score "\n"
                    printf "\t min_score : " min_score_detail "\n"
                    printf "\t max_score : " max_score_detail "\n"
                } 
            ' | less
    rm history.tmp #remove temporary file created
}


#Delete Entries from history.txt
function Delete_Entries(){
    printf "\033c"
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

    if [[ "$method" == $'\x1b' || "$method" == "q" ]] ;then #"\x1b" does not work as it is interpreted as string. So use $' ' to interpret backslash characters
        printf "\033c"
        menu_display
    elif [[ $method == 1 ]] ; then 
        read -e -p $'\e[33mSpecify a User : \e[0m' player
        read -e -p $'\e[31mAre you sure you want to delete these entries ? (y/n) - \e[0m' confirmation
        if [[ $confirmation == "y" ]]; then
            awk -F "," -v user="$player" '
                {
                    if($2 != user){
                        print $0
                    }
                }' history.txt > history.tmp
            
            mv history.tmp history.txt
            
            printf "\033c"
            printf "\e[32mhistory.txt has been updated\e[0m\n"
            update_userlist
        else 
            printf "\033c"
            menu_display
        fi
    elif [[ $method == 2 ]]; then
        read -e -p $'\e[33mEnter time stamp in format ( YYYY-MM-DD HH:MM:SS ) - \e[0m' timestamp
        if Validate_Timestamp "$timestamp" ; then 
            read -e -p $'\e[33mDo you want to delete entries after the timestamp or before (1/2) - \e[0m' option
            if [[ $option == 1 ]]; then
                read -e -p $'\e[31mAre you sure you want to delete these entries ? (y/n) - \e[0m' confirmation
                if [[ $confirmation == "y" ]]; then
                    awk -F "," -v timestamp="[$timestamp]" '
                        {
                            if($1 <= timestamp){
                                print $0
                            }
                        }
                    ' history.txt > history.tmp
                    mv history.tmp history.txt
                    
                    printf "\e[32mhistory.txt has been updated\e[0m\n"
                    update_userlist
                    printf "\033c"
                else 
                    printf "\033c"
                    menu_display
                fi
            elif [[ $option == 2 ]]; then
                read -e -p $'\e[31mAre you sure you want to delete these entries ? (y/n) - \e[0m' confirmation
                if [[ $confirmation == "y" ]]; then
                    awk -F "," -v timestamp="[$timestamp]" '
                        {
                            if($1 >= timestamp){
                                print $0
                            }
                        }
                    ' history.txt >  history.tmp
                    mv history.tmp history.txt

                    printf "\e[32mhistory.txt has been updated\e[0m\n"
                    update_userlist
                    printf "\033c"
                else
                    printf "\033c"
                    menu_display
                fi
            else
                printf "\033c"
                printf "\e[31mInvalid Command\e[0m\n"
            fi
        else 
            printf "\033c"
            printf "\e[31mInvalid Timestamp\e[0m\n"
        fi
    #Does not verify If date is correct or not 
    elif [[ $method == 3 ]]; then
        awk -F "," '{
            if ($0 ~ /^\[[0-9]+-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\],[^,]+,[0-9]+,[A-Z]+,[0-9]+$/) {
                if ($4 !~ /(WALL|SELF)/){}
                else {print $0}
            }
        }' history.txt > history.tmp
        mv history.tmp history.txt
        printf "\033c"
        printf "\e[32mNo misformated Records Remains\e[0m\n"
    fi
}

update_userlist
history -c
printf "\033c"
#Display menu untill not exited
while true; do
    menu_display
done
