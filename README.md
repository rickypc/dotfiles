[Ricky Huang](http://ricky.one) dot files
=================================================

Central repository for maintaining [dot files](https://en.wikipedia.org/wiki/Hidden_file_and_hidden_directory#Unix_and_Unix-like_environments), a compilation of configurations as well as [scripts and tools](#user-content-script-and-tool-list) developed over the years for various applications that I use daily.

They might not work for you, but feel free to try them.

Platforms: [GNU/Linux](https://www.gnu.org/gnu/linux-and-gnu.en.html) ([RHEL](https://en.wikipedia.org/wiki/Red_Hat_Enterprise_Linux)/[CentOS](https://www.centos.org/)) and [Darwin](https://en.wikipedia.org/wiki/Darwin_(operating_system))/OS X

Installation
-
Install necessary softwares and clone dotfiles repository with single command.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rickypc/dotfiles/master/bin/pre-provision)"
```

You can git clone dotfiles into your non-empty home directory with one command (free from [symlink](https://en.wikipedia.org/wiki/Symbolic_link) or bootstrap business):

```bash
cd; git init -b master; git remote add origin https://github.com/rickypc/dotfiles.git; git pull origin master; git branch --set-upstream-to origin/master; git submodule init; git submodule update
```

Or, if you would like to use SSH clone URL, like myself:

```bash
cd; git init -b master; git remote add origin git@github.com:rickypc/dotfiles.git; git pull origin master; git branch --set-upstream-to origin/master; git submodule init; git submodule update
```

Removal
-
You can remove all the files came from this git repo from your machine if necessary:

```bash
rm -rf $(git ls-files)
```

Apply Stored Stat Information
-
You can apply back any stored stat information for files/directories ownership and/or permissions.

[git-stat-cache](bin/git-stat-cache) in your ``$PATH``:

```bash
git stat-cache -a
```

Or, not:

```bash
./bin/git-stat-cache -a
```

Script and Tool List
-
Script Name                                         | Language | Description
----------------------------------------------------|----------|------------
[chmod-fix](bin/chmod-fix)                          | Bash     | Fix folder and file permissions to 755 and 644 respectively.
[chown-fix](bin/chown-fix)                          | Bash     | Fix folder and file owner to current login user and group.
[colinux-build](bin/colinux-build)                  | Bash     | Build [Colinux](https://en.wikipedia.org/wiki/Cooperative_Linux) kernel and its module.
[cpan-uninstall](bin/cpan-uninstall)                | Perl     | Uninstall [CPAN](https://en.wikipedia.org/wiki/CPAN) package.
[devel.umd.js](bin/devel.umd.js)                    | ES6      | Browser file loader for development mode.
[disk-usage](bin/disk-usage)                        | Bash     | Get disk space usage for current folder.
[docker-cleanup](bin/docker-cleanup)                | Bash     | Remove exited [Docker](https://www.docker.com) containers and untagged [Docker](https://www.docker.com) images.
[download-site](bin/download-site)                  | Bash     | Download any site for offline fair use.
[download-site-partial](bin/download-site-partial)  | Bash     | Download any site partially for offline fair use.
[flac-bits](bin/flac-bits)                          | Bash     | Get actual and advertised [FLAC](https://en.wikipedia.org/wiki/FLAC) bits.
[get-virtualenv](bin/get-virtualenv)                | Bash     | Install Python 3.x virtual environment.
[getinfo.sh](bin/getinfo.sh)                        | Bash     | Collects [CentOS](https://www.centos.org/) system hardware and software information.
[git-author-fix](bin/git-author-fix)                | Bash     | Fix author name and email in git history.
[git-blame-summary](bin/git-blame-summary)          | Perl     | Show total [LOC](https://en.wikipedia.org/wiki/Source_lines_of_code), author list, contribution percentage, and timestamp.
[git-branch-stat](bin/git-branch-stat)              | Bash     | Show code change stat between base branch and current branch.
[git-del-branch](bin/git-del-branch)                | Python   | Delete git local, remote-tracking, and remote branch.
[git-maintenance](bin/git-maintenance)              | Bash     | Sync with remote, clean, and optimize git repository.
[git-new-branch](bin/git-new-branch)                | Python   | Create git new branch from base branch, push to remote and track.
[git-new-workdir](bin/git-new-workdir)              | Bash     | Create new git working folder with shared git repository.
[git-stat-cache](bin/git-stat-cache)                | Bash     | Store and apply file / folder ownership and permissions in git.
[git-what-branch](bin/git-what-branch)              | Perl     | Show the earliest path of git commits.
[gpg-verify](bin/gpg-verify)                        | Bash     | Verify [GPG](https://www.gnupg.org/) signature from specified document path.
[json-prettifier](bin/json-prettifier)              | Bash     | Pretty print [JSON](https://www.json.org/json-en.html) document.
[json-uglifier](bin/json-uglifier)                  | Bash     | Remove whitespaces from [JSON](https://www.json.org/json-en.html) document.
[kill-port](bin/kill-port)                          | Bash     | Kill any process running on given port.
[metadata-service](bin/metadata-service)            | Bash     | Advertise local machine as AWS [EC2](https://aws.amazon.com/ec2/) instance.
[migrate-php](bin/migrate-php)                      | Bash     | Migrate between [PHP](https://www.php.net/) versions.
[mvn-deps](bin/mvn-deps)                            | Bash     | List [Maven](https://en.wikipedia.org/wiki/Apache_Maven) artifact dependencies.
[osx-show-all-files](bin/osx-show-all-files)        | Bash     | Set OSX to show all files (dot files) in Finder and file dialog permanently.
[polygon-fun](bin/polygon-fun)                      | Perl     | All fun facts about [Polygon](https://en.wikipedia.org/wiki/Polygon) geometry.
[pre-provision](bin/pre-provision)                  | Bash     | Pre-provision [development environment](https://en.wikipedia.org/wiki/Deployment_environment#Development).
[provision](bin/provision)                          | Bash     | Provision [development environment](https://en.wikipedia.org/wiki/Deployment_environment#Development).
[replace-in-place](bin/replace-in-place)            | Bash     | Replace file content in-place.
[rm-crlf](bin/rm-crlf)                              | Bash     | Remove [BOM](https://en.wikipedia.org/wiki/Byte_order_mark) character and [CRLF](https://en.wikipedia.org/wiki/Newline#Representation) inside the files.
[rm-quarantine](bin/rm-quarantine)                  | Bash     | Remove [quarantine](https://en.wikipedia.org/wiki/Gatekeeper_(macOS)#Quarantine) flag extended file attribute.
[rm-svn](bin/rm-svn)                                | Bash     | Remove [.svn](https://en.wikipedia.org/wiki/Apache_Subversion) folder. For good ol' time sakes.
[robot-lint.py](bin/robot-lint.py)                  | Python   | Lint [Robot Framework](https://robotframework.org) data files.
[robot-parallel.py](bin/robot-parallel.py)          | Python   | Run [Robot Framework](https://robotframework.org) data sources in parallel.
[search](bin/search)                                | Bash     | Search keyword inside the files.
[search-crlf](bin/search-crlf)                      | Bash     | Search [CRLF](https://en.wikipedia.org/wiki/Newline#Representation) inside the files.
[set-hostname](bin/set-hostname)                    | Bash     | Set hostname.
[slap](bin/slap)                                    | Bash     | Pull and rebase the code from git repository.
[slip](bin/slip)                                    | Bash     | Merge and push the code back to git repository.
[ssh-keygen-dsa-4096](bin/ssh-keygen-dsa-4096)      | Bash     | Generate [SSH](https://en.wikipedia.org/wiki/Secure_Shell) [DSA](https://en.wikipedia.org/wiki/Digital_Signature_Algorithm) key with 4096 bits length.
[ssh-keygen-rsa-8192](bin/ssh-keygen-rsa-8192)      | Bash     | Generate [SSH](https://en.wikipedia.org/wiki/Secure_Shell) [RSA](https://en.wikipedia.org/wiki/RSA_(algorithm)) key with 8192 bits length.
[stay-fresh](bin/stay-fresh)                        | Bash     | Clean caches, histories, logs and [brew](https://brew.sh) upgrade.
[stressor](bin/stressor)                            | Bash     | HTTP stressor with some degree of ramp up.
[update-aws-credentials](bin/update-aws-credentials)| Bash     | Update AWS [credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-where) file.
[x-launcher-client.c](bin/x-launcher-client.c)      | C        | Send command to socket server running inside [Colinux](https://en.wikipedia.org/wiki/Cooperative_Linux).
[x-launcher.c](bin/x-launcher.c)                    | C        | A socket server running inside [Colinux](https://en.wikipedia.org/wiki/Cooperative_Linux) to execute requested command.

License
-
[MIT License](https://opensource.org/licenses/MIT), unless otherwise noted.
