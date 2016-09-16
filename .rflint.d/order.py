#!/usr/bin/env python
# -*- coding: utf-8 -*-

#    Robot Lint Rules - Lint rules for Robot Framework data files.
#    Copyright (c) 2014, 2015, 2016 Richard Huang <rickypc@users.noreply.github.com>
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
Robot Lint Rules - Lint rules for Robot Framework data files.
"""

from rflint.common import GeneralRule, WARNING
from rflint.parser import Keyword, KeywordTable, SettingTable, VariableTable


def _get_diffs(items, reporter, is_keyword=False):
    """Returns order differences if any."""
    last = {'line': -1, 'name': ''}
    for item in items:
        name = item.name if is_keyword else item[0].strip() or ''
        if name !='' and name != '...' and not name.startswith('#'):
            if ((name > last['name']) - (name < last['name'])) < 0:
                if len(name) <= len(last['name']):
                    reporter('"%s" comes before "%s".' % (last['name'], name),
                             last['line'])
            last['line'] = item.linenumber
            last['name'] = name


class KeywordNameOrder(GeneralRule):
    """Warn about un-ordered keyword name.
    """
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        # pylint: disable=expression-not-assigned
        [_get_diffs(table.keywords, lambda message, line:
                    self.report(robot_file, message, line), True)
         for table in robot_file.tables if isinstance(table, KeywordTable)]


class SettingNameOrder(GeneralRule):
    """Warn about un-ordered setting name.
    """
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        # pylint: disable=expression-not-assigned
        [_get_diffs(table.rows, lambda message, line:
                    self.report(robot_file, message, line))
         for table in robot_file.tables if isinstance(table, SettingTable)]


class VariableNameOrder(GeneralRule):
    """Warn about un-ordered variable name.
    """
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        # pylint: disable=expression-not-assigned
        [_get_diffs(table.rows, lambda message, line:
                    self.report(robot_file, message, line))
         for table in robot_file.tables if isinstance(table, VariableTable)]
