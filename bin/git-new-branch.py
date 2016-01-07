#!/usr/bin/env python

#    Git Create New Branch - Create new branch from base branch in git repository.
#    Copyright (C) 2010-2016  Richard Huang <rickypc@users.noreply.github.com>
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.

from argparse import ArgumentParser
from getpass import getuser
from os import getcwd
from traceback import format_exception_only
import sys
from distutils.util import strtobool
from git import Repo


class FeatureBranch():
    """Create feature branch class."""

    def __init__(self, **kwargs):
        self.base = kwargs.pop('base', None)
        self.cwd = getcwd()
        self.exit_code = 0
        self.git = None
        self.name = kwargs.pop('name', None)
        self.origin = kwargs.pop('origin', 'origin')
        self.repo = None
        self.success = False
        self.user = getuser()
        self.user_prefix = kwargs.pop('user_prefix', None)
        if self.user_prefix is None:
            self.user_prefix = True
        else:
            try:
                self.user_prefix = strtobool(self.user_prefix.lower())
            except ValueError:
                self.user_profile = True
        if not self.base:
            base_default = '%s/' % self.origin if self.origin else ''
            self.base = raw_input('Please enter remote branch name without git remote name [%s]: '
                                  % base_default)
        if not self.name:
            name_default = '%s/' % self.user if self.user_prefix else ''
            self.name = raw_input('Please enter feature branch name without user prefix [%s]: '
                                  % name_default)
        self.source = '%s/%s' % (self.origin, self.base) if self.origin else self.base
        self.target = '%s/%s' % (self.user, self.name) if self.user_prefix else self.name

    def create(self):
        message = 'Creating %s branch from %s' % (self.target, self.source)
        self.notify(message)
        try:
            self.git.checkout('-f', '-b', self.target, self.source)
            self.notify(message, 'Done')
            self.push()
        except Exception as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])

    def fetch(self):
        message = 'Fetching all branches from remote repository'
        self.notify(message)
        try:
            self.git.fetch(self.origin)
            self.notify(message, 'Done')
        except Exception as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])

    def get_relationship(self):
        format_arg = '--format=%(refname:short) is up-to-date with %(upstream:short)'
        print(self.git.for_each_ref(format_arg, self.git.symbolic_ref('-q', 'HEAD')))

    def get_repo(self):
        try:
            self.repo = Repo(self.cwd)
            self.git = self.repo.git
        except:
            self.git = None
            self.repo = None

    def notify(self, message, status=None):
        sys.stdout.write('\r{0: <69}'.format(message))
        if status:
            sys.stdout.write(' [{0}]\n'.format(status))
        sys.stdout.flush()

    def notify_ready(self):
        if self.success:
            print('Your feature branch "%s" is ready!' % self.target)

    def prune(self):
        message = 'Removing stale remote branches'
        self.notify(message)
        try:
            self.git.remote('prune', self.origin)
            self.notify(message, 'Done')
        except Exception as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])

    def push(self):
        message = 'Pushing %s branch to remote repository' % self.target
        self.notify(message)
        try:
            self.git.push('-u', self.origin, '%s:%s' % (self.target, self.target))
            self.notify(message, 'Done')
            self.success = True
        except Exception as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])

    def user_want_to_discard_changes(self):
        message = ('This program will discard any changes in %s permanently. Continue [y]? '
                   % self.cwd)
        response = False
        if not self.repo.is_dirty():
            return response
        try:
            choice = raw_input(message) or 'y'
            response = strtobool(choice.lower())
        except ValueError:
            response = False
        return response

    def validate_input(self):
        if not self.base:
            print('Base remote branch name is empty.')
            self.exit_code = -1
        if not self.name:
            print('Feature branch name is empty.')
            self.exit_code = -2

    def validate_repo(self):
        origin = self.repo.remotes.origin if self.repo else None
        if not self.repo:
            print('%s is not a git repository.' % self.cwd)
            self.exit_code = -3
        if self.repo and not self.repo.git_dir.startswith(self.repo.working_tree_dir):
            print('%s is not a git repository.' % self.cwd)
            self.exit_code = -4
        if self.repo and self.repo.bare:
            print('%s is a bare repository.' % self.cwd)
            self.exit_code = -5
        if origin and not origin.exists():
            print('Remote repository is not set.')
            self.exit_code = -6


def main():
    """Create feature branch from base branch in git repository."""
    parser = ArgumentParser(description=main.__doc__)
    parser.add_argument('-b', '--base', help="Base remote branch name without git remote name.")
    parser.add_argument('-n', '--name', help="Feature branch name without user prefix.")
    parser.add_argument('-o', '--origin', default='origin',
                        help="Git remote name. Default: 'origin'")
    parser.add_argument('-u', '--user_prefix',
                        help="Prefix feature branch name with current user. Default: True")

    feature_branch = FeatureBranch(**vars(parser.parse_args()))
    feature_branch.validate_input()
    if feature_branch.exit_code != 0:
        print('Aborted.')
        sys.exit(feature_branch.exit_code)

    feature_branch.get_repo()
    feature_branch.validate_repo()
    if feature_branch.exit_code != 0:
        print('Aborted.')
        sys.exit(feature_branch.exit_code)

    if not feature_branch.user_want_to_discard_changes():
        print('User canceled out of discard changes in working directory.')
        sys.exit(0)

    feature_branch.fetch()
    feature_branch.prune()
    feature_branch.create()
    feature_branch.get_relationship()
    feature_branch.notify_ready()


if __name__ == "__main__":
    main()
