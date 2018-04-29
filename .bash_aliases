# ~/.bash_aliases: executed by bash(1) for all shells.

alias la='ls -A'
alias l='ls -CF'

# scp w/ resume capability
alias scpr='rsync --partial --archive --compress --progress --verbose --rsh=ssh'

# MIMP (MacOS, Nginx, MySQL, PHP)
alias server.restart='brew services restart mysql && brew services restart php@7.1 && sudo brew services restart nginx'
alias server.stop='brew services stop mysql && brew services stop php@7.1 && sudo brew services stop nginx'
alias tail.php.error='tail -250f /usr/local/var/log/php_errors.log'
