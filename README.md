Richard Huang dot files
=======================

Central repository for maintaining my own dot files, and a compilation of configurations developed over the years for various apps that I use daily.

They might not work for you, but feel free to use them.

Platforms: GNU/Linux (RHEL/CentOS) and Darwin/OS X

Installation
-
You can git clone dotfiles into your non-empty home directory with one command:

```bash
$ cd; git init; git remote add origin https://github.com/rickypc/dotfiles.git; git pull
```

Or, if you would like to use SSH clone URL like myself:

```bash
$ cd; git init; git remote add origin git@github.com:rickypc/dotfiles.git; git pull
```

Apply Stored Stat Information
-
You can apply back any stored stat information on files / directories ownership and permissions:

```bash
$ git stat-cache -a
```

Script List
-

Script Name           | Language | Description
----------------------|----------|------------
chmod-fix             | Bash     | Fix folder and file permissions to 755 and 644 respectively.
colinux-build         | Bash     | Build Colinux kernel and its module.
cpan-uninstall        | Perl     | Uninstall CPAN package.
download-site         | Bash     | Download any site for offline fair use.
download-site-partial | Bash     | Download any site partially for offline fair use.
flac-bits             | Bash     | Get real and advertise FLAC bits.
getinfo.sh            | Bash     | Collects CentOS system hardware and software information.
git-author-fix        | Bash     | Fix author name and email in git history.
git-blame-summary     | Perl     | Show total LOC, author list, contribution percentage, and timestamp.
git-new-workdir       | Bash     | Create new git working folder with shared git repository.
git-prompt.sh         | Bash     | Show repository status in your shell prompt.
git-stat-cache        | Bash     | Store and apply file / folder ownership and permissions in git.
mvn-deps              | Bash     | List Maven artifact dependencies.
replace-in-place      | Bash     | Replace file content in-place.
rm-svn                | Bash     | Remove .svn folder. For good ol' time sakes.
search                | Bash     | Search keyword inside the files. 
slack                 | Bash     | Pull and rebase the code for git repository.
slip                  | Bash     | Merge and push the code back to git repository.
ssh-keygen-dsa-4096   | Bash     | Generate SSH DSA key with 4096 bits length.
ssh-keygen-rsa-8192   | Bash     | Generate SSH RSA key with 8192 bits length. 
x-launcher-client.c   | C        | Send command to socket server running inside Colinux.
x-launcher.c          | C        | A socket server running inside Colinux to execute requested command.

License
-
[MIT License](http://opensource.org/licenses/MIT), unless otherwise noted.
