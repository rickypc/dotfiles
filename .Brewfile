personal = `hostname -s`.strip.start_with?('Ric')
tap 'golangci/tap'
tap 'homebrew/bundle'
tap 'homebrew/services'
brew "python@#{ENV['HOMEBREW_PYTHON_LTS']}", link: :overwrite
brew 'awscli'
brew 'cloc' unless personal
brew 'colima', restart_service: true unless personal
brew 'coreutils'
brew 'curl'
brew 'dive' unless personal
brew 'docker', link: :overwrite unless personal
brew 'docker-buildx', link: :overwrite unless personal
brew 'dos2unix' unless personal
brew 'ffmpeg'
brew 'gh'
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
brew "node@#{ENV['HOMEBREW_NODE_LTS']}", conflicts_with: ['node'], link: :overwrite
brew 'openssl@3'
brew "php@#{ENV['HOMEBREW_PHP_LTS']}", conflicts_with: ['php'], link: :overwrite, restart_service: true
brew 'redis', restart_service: true unless personal
brew 'starship'
brew 'vim'
brew 'vips' if personal
brew 'virtualenv', link: :overwrite
cask 'aerial'
cask 'dotnet-sdk' unless personal
cask 'firefox'
cask 'gimp'
cask 'google-chrome' if personal
cask 'iterm2'
cask 'microsoft-auto-update'
cask 'microsoft-edge'
cask 'omnidisksweeper'
cask 'opera'
cask 'redisinsight' unless personal
cask 'temurin8' unless personal
cask 'visual-studio-code'
