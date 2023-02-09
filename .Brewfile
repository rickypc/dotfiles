personal = `hostname -s`.strip.start_with?('Ric')
tap 'golangci/tap'
tap 'homebrew/bundle'
tap 'homebrew/cask'
tap 'homebrew/cask-versions' unless personal
tap 'homebrew/core'
tap 'homebrew/services'
tap 'romkatv/powerlevel10k'
brew 'python@3.9', link: false
brew 'python@3.10', link: false
brew 'python@3.11', link: true
brew 'awscli'
brew 'cloc' unless personal
brew 'colima' unless personal
brew 'coreutils'
brew 'curl'
brew 'dive' unless personal
brew 'docker', link: :overwrite unless personal
brew 'dos2unix' unless personal
brew 'ffmpeg'
brew 'git'
brew 'gnupg' if personal
brew 'go'
brew 'golangci/tap/golangci-lint'
brew 'gource' unless personal
brew 'html-xml-utils' unless personal
brew 'imagemagick'
brew 'jq'
brew 'mysql', restart_service: true
brew 'nginx', restart_service: true
brew 'node@18', link: :overwrite
brew 'openssl@3'
brew 'php@8.1', restart_service: true, link: :overwrite
brew 'redis', restart_service: true unless personal
brew 'romkatv/powerlevel10k/powerlevel10k'
brew 'vim'
cask 'aerial'
cask 'dotnet-sdk' unless personal
cask 'firefox'
cask 'gimp'
cask 'microsoft-auto-update'
cask 'microsoft-edge'
cask 'mono-mdk-for-visual-studio' unless personal
cask 'omnidisksweeper'
cask 'opera'
cask 'redisinsight' unless personal
cask 'sqlworkbenchj' unless personal
cask 'temurin8' unless personal
cask 'visual-studio' unless personal
cask 'visual-studio-code'
