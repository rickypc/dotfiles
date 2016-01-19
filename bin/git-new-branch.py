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

"""
Git Create New Branch - Create new branch from base branch in git repository.
"""

from __future__ import print_function
from argparse import ArgumentParser
from getpass import getuser
from os import getcwd
from traceback import format_exception_only
import sys
from distutils.util import strtobool
from git import Repo
from git.exc import GitCommandError


class FeatureBranch(object):
    """Create feature branch class."""

    def __init__(self, **kwargs):
        """Initialize create new feature branch class."""
        self.inputs = {
            'base': kwargs.pop('base', None),
            'cwd': getcwd(),
            'name': kwargs.pop('name', None),
            'origin': kwargs.pop('origin', 'origin'),
        }
        self.outputs = {
            'exit_code': 0,
            'git': None,
            'repo': None,
            'success': False
        }
        user = getuser()
        user_prefix = True
        user_prefix_str = kwargs.pop('user_prefix', None)
        if user_prefix_str is not None:
            try:
                user_prefix = strtobool(user_prefix_str.lower())
            except ValueError:
                user_prefix = True
        if not self.inputs['base']:
            base_default = '%s/' % self.inputs['origin'] if self.inputs['origin'] else ''
            base_message = 'Please enter remote branch name without git remote name [%s]: '
            self.inputs['base'] = raw_input(base_message % base_default)
        if not self.inputs['name']:
            name_default = '%s/' % user if user_prefix else ''
            name_message = 'Please enter feature branch name without user prefix [%s]: '
            self.inputs['name'] = raw_input(name_message % name_default)
        self.source = '%s/%s' % (self.inputs['origin'], self.inputs['base']) \
                      if self.inputs['origin'] else self.inputs['base']
        self.target = '%s/%s' % (user, self.inputs['name']) \
                      if user_prefix else self.inputs['name']

    def create(self):
        """Create new branch from base branch."""
        message = 'Creating %s branch from %s' % (self.target, self.source)
        self.notify(message)
        try:
            self.outputs['git'].checkout('-f', '-b', self.target, self.source)
            self.notify(message, 'Done')
            self.push()
        except GitCommandError as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])
        except Exception as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])

    def fetch(self):
        """Git fetch remote repository."""
        message = 'Fetching all branches from remote repository'
        self.notify(message)
        try:
            self.outputs['git'].fetch(self.inputs['origin'])
            self.notify(message, 'Done')
        except GitCommandError as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])
        except Exception as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])

    def get_relationship(self):
        """Render the relationship between local repository and remote repository."""
        format_arg = '--format=%(refname:short) is up-to-date with %(upstream:short)'
        print(self.outputs['git'].for_each_ref(format_arg,
                                               self.outputs['git'].symbolic_ref('-q', 'HEAD')))

    def get_repo(self):
        """Instantiate Git repository object and Git object."""
        try:
            self.outputs['repo'] = Repo(self.inputs['cwd'])
            self.outputs['git'] = self.outputs['repo'].git
        except Exception:
            self.outputs['git'] = None
            self.outputs['repo'] = None

    @staticmethod
    def notify(message, status=None):
        """Notify the progress and status to standard output."""
        sys.stdout.write('\r{0: <69}'.format(message))
        if status:
            sys.stdout.write(' [{0}]\n'.format(status))
        sys.stdout.flush()

    def notify_ready(self):
        """Notify that the new branch is ready."""
        if self.outputs['success']:
            print('Your feature branch "%s" is ready!' % self.target)

    def prune(self):
        """Git prune any stale branch in local repository."""
        message = 'Removing stale remote branches'
        self.notify(message)
        try:
            self.outputs['git'].remote('prune', self.inputs['origin'])
            self.notify(message, 'Done')
        except GitCommandError as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])
        except Exception as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])

    def push(self):
        """Git push new created branch to remote repository and set direct relationship to it."""
        message = 'Pushing %s branch to remote repository' % self.target
        self.notify(message)
        try:
            self.outputs['git'].push('-u', self.inputs['origin'],
                                     '%s:%s' % (self.target, self.target))
            self.notify(message, 'Done')
            self.outputs['success'] = True
        except GitCommandError as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])
        except Exception as ex:
            self.notify(message, 'Failed')
            print(format_exception_only(type(ex), ex)[0])

    def user_want_to_discard_changes(self):
        """Ask user confirmation to discard any changes in their workspace."""
        message = ('This program will discard any changes in %s permanently. Continue [y]? '
                   % self.inputs['cwd'])
        response = True
        if not self.outputs['repo'].is_dirty():
            return response
        try:
            choice = raw_input(message) or 'y'
            response = strtobool(choice.lower())
        except ValueError:
            response = False
        return response

    def validate_input(self):
        """Validate user input."""
        if not self.inputs['base']:
            print('Base remote branch name is empty.')
            self.outputs['exit_code'] = -1
        if not self.inputs['name']:
            print('Feature branch name is empty.')
            self.outputs['exit_code'] = -2

    def validate_repo(self):
        """Validate git repository."""
        cwd = self.inputs['cwd']
        origin = None
        repo = self.outputs['repo']
        if not repo:
            print('%s is not a git repository.' % cwd)
            self.outputs['exit_code'] = -3
        else:
            origin = repo.remotes.origin
            if not repo.git_dir.startswith(repo.working_tree_dir):
                print('%s is not a git repository.' % cwd)
                self.outputs['exit_code'] = -4
            if repo.bare:
                print('%s is a bare repository.' % cwd)
                self.outputs['exit_code'] = -5
        if origin and not origin.exists():
            print('Remote repository is not set.')
            self.outputs['exit_code'] = -6


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
    if feature_branch.outputs['exit_code'] != 0:
        print('Aborted.')
        sys.exit(feature_branch.outputs['exit_code'])

    feature_branch.get_repo()
    feature_branch.validate_repo()
    if feature_branch.outputs['exit_code'] != 0:
        print('Aborted.')
        sys.exit(feature_branch.outputs['exit_code'])

    if not feature_branch.user_want_to_discard_changes():
        print('User cancelled out of discard changes in working directory.')
        sys.exit(0)

    feature_branch.fetch()
    feature_branch.prune()
    feature_branch.create()
    feature_branch.get_relationship()
    feature_branch.notify_ready()


if __name__ == "__main__":
    main()
