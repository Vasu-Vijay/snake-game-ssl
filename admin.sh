#/bin/bash


#Specified Current User/Users being analysed.
user=all 
#Different type of operations that can be performed from menu.
operation=("Query_User" "Recent_Score" "Analytics" "Delete_Entries" "Log_Rotation" "Specific_View" "Exit")

#Displays menu with selectable operations on terminal.
function menu_display(){ 
    printf "1] Query about a Specific User\n"
    printf "2] View scores of recent games\n"
    printf "3] View Analytics\n"
    printf "4] Delete Entries\n"
    printf "5] Log Rotation\n"
    printf "6] Specific View\n"
    printf "7] Exit\n"

    read command
    while ! [[ "$command" =~ ^[1-7]$ ]]
    do
        printf "Please enter a valid command\n"
        read command
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
    read -p "Enter Username : " user

    if [[ "$user" == "all" ]]; then {
        printf "All Users Will be Queried\n" 
    }
    else {
        printf "$user will be Queried\n"
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
    head -10 history.txt > history.tmp
    tar -czf history.tar.gz history.txt
    mv history.tmp history.txt
    
    printf "\033c"
    printf "Logs have been backed up\n"
}

#View the logs sorted based on specific filters(time stamp as default.)
function Specific_View(){
    printf "\033c"
    printf "Select a specific feture to filter\n"
    printf "1] User\n"
    printf "2] Time survived\n"
    printf "3] Score\n"
    printf "4] Time Stamp (Default)\n"
    read -sn 1 key
    if [[ "$key" == '1' ]];then {
        read -p "Enter the specific user : " sp_user
        awk -v sp_user="$sp_user" -F "," '
            {if( "$2" == sp_user ){
                print $0
            }}
        ' history.txt | less
    } elif [[ "$key" == '2' ]];then {
        sort -rnt "," -k 5 history.txt | less
    } elif [[ "$key" == '3' ]];then {
        sort -rnt "," -k 3,3 history.txt | less
    } elif [[ "$key" == 'q' || "$key" == $'\x1b' ]];then {
        menu_display
    } else {
        sort -rt "," -k 1 history.txt | less
    } fi     
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
    printf "Choose a method to delete\n"
    printf "1] Specific User\n"
    printf "2] Timestamp\n"
    printf "3] Misformatted Records\n"
    read method
    
    if [[ $method == 1 ]] ; then #Delete Entries based on User 
        read -p "Specify a User : " player 
        read -p "Are you sure you want to delete these entries?(y/n)" confirmation
        if [[ $confirmation == "y" ]]; then
            awk -F "," -v user="$player" '
                {
                    if($2 != user)){
                        print $0
                    }
                }' history.txt > history.tmp
            
            mv history.tmp history.txt
            printf "history.txt has been updated\n"
        else 
            menu_display
        fi
    elif [[ $method == 2 ]]; then #Delete entries Based on timestamp
        read -p "Enter time stamp in format YYYY-MM-DD HH:MM:SS" timestamp
        if date -d "$timestamp" "+%Y-%m-%d %H:%M:%S" >/dev/null 2>&1 ; then 
            read -p "Do you want to delete entries after the timestamp or before (1/2)" option
            if [[ $option == 1 ]]; then
                read -p "Are you sure you want to delete these entries?(y/n)" confirmation
                if [[ $confirmation == "y" ]]; then
                    awk -F "," -v timestamp="[$timestamp]" '
                        {
                            if($1 <= timestamp){
                                print $0
                            }
                        }
                    ' history.txt > history.tmp
                    mv history.tmp history.txt
                    printf "history.txt has been updated\n"
                else 
                    menu_display
                fi
            elif [[ $option == 2 ]]; then
                read -p "Are you sure you want to delete these entries?(y/n)" confirmation
                if [[ $confirmation == "y" ]]; then
                    awk -F "," -v timestamp="[$timestamp]" '
                        {
                            if($1 >= timestamp){
                                print $0
                            }
                        }
                    ' history.txt >  history.tmp
                    mv history.tmp history.txt
                    printf "history.txt has been updated\n"
                else
                    menu_display
                fi
            fi
        fi
    elif [[ $method == 3 ]]; then #Delete Entries if they do not match format
        awk -F "," '{
            if ($0 ~ /^\[[0-9]+-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\],[^,]+,[0-9]+,[A-Z]+,[0-9]+$/) {
                if ($4 !~ /(WALL|SELF)/){}
                else {print $0}
            }
        }' history.txt > history.tmp
        mv history.tmp history.txt
    fi
}

#Display menu untill not exited
while true; do
    menu_display
done
