# ~/.zlogout: executed by zsh(1) when login shell exits.

# only done these below on the last zsh session - $SHLVL doesn't quite work
# Total of 4, the tty, the ps, the grep and the wc ;)
if [ "$(ps -u $USER | grep zsh | wc -l)" = "2" ]; then
    # see hidden files
    setopt GLOB_DOTS

    colima stop
    limactl stop colima -f

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

    # clear zsh history
    :>~/.zsh_history
    history -c
fi
