[Richard Huang](http://richardhuang.me) dot files
=================================================

Central repository for maintaining [dot files](https://en.wikipedia.org/wiki/Hidden_file_and_hidden_directory#Unix_and_Unix-like_environments), a compilation of configurations as well as [scripts and tools](#user-content-script-and-tool-list) developed over the years for various applications that I use daily.

They might not work for you, but feel free to try them.

Platforms: [GNU/Linux](https://www.gnu.org/gnu/linux-and-gnu.en.html) ([RHEL](https://en.wikipedia.org/wiki/Red_Hat_Enterprise_Linux)/[CentOS](https://www.centos.org/)) and [Darwin](https://en.wikipedia.org/wiki/Darwin_(operating_system))/OS X

Installation
-
You can git clone dotfiles into your non-empty home directory with one command (free from [symlink](https://en.wikipedia.org/wiki/Symbolic_link) or bootstrap business):

```bash
$ cd; git init; git remote add origin https://github.com/rickypc/dotfiles.git; git checkout -b master origin/master; git pull origin
```

Or, if you would like to use SSH clone URL, like myself:

```bash
$ cd; git init; git remote add origin git@github.com:rickypc/dotfiles.git; git checkout -b master origin/master; git pull origin
```

Apply Stored Stat Information
-
You can apply back any stored stat information for files/directories ownership and/or permissions.

[git-stat-cache](bin/git-stat-cache) in your ``$PATH``:

```bash
$ git stat-cache -a
```

Or, not:

```bash
$ bin/git-stat-cache -a
```

Script and Tool List
-
Script Name                                         | Language | Description
----------------------------------------------------|----------|------------
[chmod-fix](bin/chmod-fix)                          | Bash     | Fix folder and file permissions to 755 and 644 respectively.
[chown-fix](bin/chown-fix)                          | Bash     | Fix folder and file owner to current login user and group.
[clean-hists-and-logs](bin/clean-hists-and-logs)    | Bash     | Clean histories and logs.
[colinux-build](bin/colinux-build)                  | Bash     | Build [Colinux](https://en.wikipedia.org/wiki/Cooperative_Linux) kernel and its module.
[cpan-uninstall](bin/cpan-uninstall)                | Perl     | Uninstall [CPAN](https://en.wikipedia.org/wiki/CPAN) package.
[disk-usage](bin/disk-usage)                        | Bash     | Get disk space usage for current folder.
[download-site](bin/download-site)                  | Bash     | Download any site for offline fair use.
[download-site-partial](bin/download-site-partial)  | Bash     | Download any site partially for offline fair use.
[flac-bits](bin/flac-bits)                          | Bash     | Get actual and advertised [FLAC](https://en.wikipedia.org/wiki/FLAC) bits.
[get-virtualenv](bin/get-virtualenv)                | Bash     | Install Python 2.x and 3.x virtual environment alongside each other.
[getinfo.sh](bin/getinfo.sh)                        | Bash     | Collects [CentOS](https://www.centos.org/) system hardware and software information.
[git-author-fix](bin/git-author-fix)                | Bash     | Fix author name and email in git history.
[git-blame-summary](bin/git-blame-summary)          | Perl     | Show total [LOC](https://en.wikipedia.org/wiki/Source_lines_of_code), author list, contribution percentage, and timestamp.
[git-del-branch.py](bin/git-del-branch.py)          | Python   | Delete git local, remote-tracking, and remote branch.
[git-maintenance](bin/git-maintenance)              | Bash     | Sync with remote, clean, and optimize git repository.
[git-new-branch.py](bin/git-new-branch.py)          | Python   | Create git new branch from base branch, push to remote and track.
[git-new-workdir](bin/git-new-workdir)              | Bash     | Create new git working folder with shared git repository.
[git-prompt.sh](bin/git-prompt.sh)                  | Bash     | Show repository status in your shell prompt.
[git-stat-cache](bin/git-stat-cache)                | Bash     | Store and apply file / folder ownership and permissions in git.
[gpg-verify](bin/gpg-verify)                        | Bash     | Verify [GPG](https://www.gnupg.org/) signature from specified document path.
[git-what-branch](bin/git-what-branch)              | Perl     | Show the earliest path of git commits.
[json-prettifier](bin/json-prettifier)              | Bash     | Pretty print JSON document.
[json-uglifier](bin/json-uglifier)                  | Bash     | Remove whitespaces from JSON document.
[mvn-deps](bin/mvn-deps)                            | Bash     | List [Maven](https://en.wikipedia.org/wiki/Apache_Maven) artifact dependencies.
[osx-show-all-files](bin/osx-show-all-files)        | Bash     | Set OSX to show all files (dot files) in Finder and file dialog permanently.
[polygon-fun](bin/polygon-fun)                      | Perl     | All fun facts about Polygon geometry.
[replace-in-place](bin/replace-in-place)            | Bash     | Replace file content in-place.
[rm-svn](bin/rm-svn)                                | Bash     | Remove [.svn](https://en.wikipedia.org/wiki/Apache_Subversion) folder. For good ol' time sakes.
[robot-lint.py](bin/robot-lint.py)                  | Python   | Lint Robot Framework data files.
[robot-parallel.py](bin/robot-parallel.py)          | Python   | Run Robot Framework data sources in parallel.
[search](bin/search)                                | Bash     | Search keyword inside the files.
[search-crlf](bin/search-crlf)                      | Bash     | Search CRLF inside the files.
[set-hostname](bin/set-hostname)                    | Bash     | Set hostname.
[slack](bin/slack)                                  | Bash     | Pull and rebase the code from git repository.
[slip](bin/slip)                                    | Bash     | Merge and push the code back to git repository.
[ssh-keygen-dsa-4096](bin/ssh-keygen-dsa-4096)      | Bash     | Generate [SSH](https://en.wikipedia.org/wiki/Secure_Shell) [DSA](https://en.wikipedia.org/wiki/Digital_Signature_Algorithm) key with 4096 bits length.
[ssh-keygen-rsa-8192](bin/ssh-keygen-rsa-8192)      | Bash     | Generate [SSH](https://en.wikipedia.org/wiki/Secure_Shell) [RSA](https://en.wikipedia.org/wiki/RSA_(algorithm)) key with 8192 bits length.
[x-launcher-client.c](bin/x-launcher-client.c)      | C        | Send command to socket server running inside [Colinux](https://en.wikipedia.org/wiki/Cooperative_Linux).
[x-launcher.c](bin/x-launcher.c)                    | C        | A socket server running inside [Colinux](https://en.wikipedia.org/wiki/Cooperative_Linux) to execute requested command.

License
-
[MIT License](http://opensource.org/licenses/MIT), unless otherwise noted.
