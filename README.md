# [Ricky Huang](https://ricky.one) Dotfiles

This repository serves as a centralized collection of my personal
[dotfiles](https://en.wikipedia.org/wiki/Hidden_file_and_hidden_directory#Unix_and_Unix-like_environments) -
configuration files, [scripts, and tools](#user-content-script-and-tool-list)
I've curated over the years to support my daily workflows across various platforms.

While these setups are tailored to my environment, you're welcome to explore
and adapt them to your own needs.

## Supported Platforms

- [GNU/Linux](https://www.gnu.org/gnu/linux-and-gnu.en.html):
  including [RHEL](https://en.wikipedia.org/wiki/Red_Hat_Enterprise_Linux)
  and [CentOS](https://www.centos.org/)
- [Darwin](https://en.wikipedia.org/wiki/Darwin_(operating_system))/macOS:
  compatible with both [Apple Silicon](https://en.wikipedia.org/wiki/Apple_silicon#M_series)
  and Intel architectures

## Installation

To install required software and clone the dotfiles repository in one step:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rickypc/dotfiles/main/bin/pre-provision)"
```

Alternatively, you can manually clone the repository into a non-empty
home directory - no symlinks or bootstrapping required:

```bash
cd
git init -b main
git remote add origin https://github.com/rickypc/dotfiles.git
git pull origin main
git branch --set-upstream-to origin/main
git submodule init
git submodule update
```

Prefer SSH? Here's the equivalent setup:

```bash
cd
git init -b main
git remote add origin git@github.com:rickypc/dotfiles.git
git pull origin main
git branch --set-upstream-to origin/main
git submodule init
git submodule update

```

## Removal

To remove all files tracked by this repository from your system:

```bash
rm -rf $(git ls-files)
```

## Restoring File Metadata

To reapply stored ownership and permission metadata for files and directories,
use the [git-stat-cache](bin/git-stat-cache) utility:

If it's in your `$PATH`:

```bash
git stat-cache -a
```

Otherwise, run it directly:

```bash
./bin/git-stat-cache -a
```

## Script and Tool List

Below is a curated list of scripts and utilities included in this repository.

Script Name                                         | Language | Description
----------------------------------------------------|----------|------------
[apply](bin/apply)                                  | Bash     | Apply all available patches.
[chmod-fix](bin/chmod-fix)                          | Bash     | Fix folder and file permissions to 755 and 644 respectively.
[chown-fix](bin/chown-fix)                          | Bash     | Fix folder and file owner to current login user and group.
[cloc-md](bin/cloc-md)                              | Bash     | CLOC on multi git repos with md format.
[colinux-build](bin/colinux-build)                  | Bash     | Build [Colinux](https://en.wikipedia.org/wiki/Cooperative_Linux) kernel and its module.
[cpan-uninstall](bin/cpan-uninstall)                | Perl     | Uninstall [CPAN](https://en.wikipedia.org/wiki/CPAN) package.
[devel.umd.js](bin/devel.umd.js)                    | ES6      | Browser file loader for development mode.
[disk-usage](bin/disk-usage)                        | Bash     | Get disk space usage for current folder.
[displays](bin/displays)                            | Bash     | Set all available display placements.
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
[git-visual](bin/git-visual)                        | Bash     | Create Git activity visualization video.
[git-what-branch](bin/git-what-branch)              | Perl     | Show the earliest path of git commits.
[gpg-verify](bin/gpg-verify)                        | Bash     | Verify [GPG](https://www.gnupg.org/) signature from specified document path.
[json-prettifier](bin/json-prettifier)              | Bash     | Pretty print [JSON](https://www.json.org/json-en.html) document.
[json-uglifier](bin/json-uglifier)                  | Bash     | Remove whitespaces from [JSON](https://www.json.org/json-en.html) document.
[kill-port](bin/kill-port)                          | Bash     | Kill any process running on given port.
[m3u8-mp4](bin/m3u8-mp4)                            | Bash     | Convert [m3u8](https://en.wikipedia.org/wiki/M3U) playlist to [mp4](https://en.wikipedia.org/wiki/MPEG-4_Part_14) video.
[metadata-service](bin/metadata-service)            | Bash     | Advertise local machine as AWS [EC2](https://aws.amazon.com/ec2/) instance.
[migrate-php](bin/migrate-php)                      | Bash     | Migrate between [PHP](https://www.php.net/) versions.
[mvn-deps](bin/mvn-deps)                            | Bash     | List [Maven](https://en.wikipedia.org/wiki/Apache_Maven) artifact dependencies.
[osx-displays](bin/osx-displays)                    | Bash     | Show current display settings.
[osx-flush-dns](bin/osx-flush-dns)                  | Shell    | Flush DNS caches on OSX.
[osx-show-all-files](bin/osx-show-all-files)        | Bash     | Set OSX to show all files (dot files) in Finder and file dialog permanently.
[pack](bin/pack)                                    | Bash     | Sanitize the source and pack them all.
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
[unprovision](bin/unprovision)                      | Bash     | Unprovision [development environment](https://en.wikipedia.org/wiki/Deployment_environment#Development).
[update-aws-credentials](bin/update-aws-credentials)| Bash     | Update AWS [credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-where) file.
[x-launcher-client.c](bin/x-launcher-client.c)      | C        | Send command to socket server running inside [Colinux](https://en.wikipedia.org/wiki/Cooperative_Linux).
[x-launcher.c](bin/x-launcher.c)                    | C        | A socket server running inside [Colinux](https://en.wikipedia.org/wiki/Cooperative_Linux) to execute requested command.

## License

This repository is licensed under the [MIT License](https://opensource.org/licenses/MIT),
unless explicitly stated otherwise for specific files or components.
