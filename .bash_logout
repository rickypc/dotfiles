# ~/.bash_logout: executed by bash(1) when login shell exits.

# only done these below on the last bash session - $SHLVL doesn't quite work
# Total of 4, the tty, the ps, the grep and the wc ;)
if [ "$(ps -u $USER | grep bash | wc -l)" = "2" ]; then
    # see hidden files
    shopt -s dotglob

    # Shutdown Tomcat
    CATALINA_STARTED=$(ps x | grep 'org.apache.catalina.startup.Bootstrap start' | grep -v grep)
    if [ -n "$CATALINA_STARTED" ]; then
        $CATALINA_HOME/bin/shutdown.sh
        kill -9 $(echo $CATALINA_STARTED | awk '{print $1}')
    fi

    # when leaving the console, clear the screen to increase privacy
    [ -x /usr/bin/clear ] && /usr/bin/clear -q

    # remove all SSH keys
    /usr/bin/ssh-add -D >/dev/null 2>&1
    #/usr/bin/ssh-agent -k >/dev/null 2>&1
    #unset SSH_AUTH_SOCK
    #unset SSH_AGENT_PID

    :>~/.lesshst
    [ -f ~/.mysql_history ] && :>~/.mysql_history

    # clear vim history
    rm -rf ~/.vim/backup/*
    #rm -rf ~/.vim/backup/.??*
    [ -d ~/.vim6 ] && rm -rf ~/.vim6/backup/*
    #rm -rf ~/.vim6/backup/.??*
    :>~/.viminfo

    # clear bash history
    :>~/.bash_history
    history -c
fi
