#!/usr/bin/env python
# -*- coding: utf-8 -*-

#    Robot Lint Rules - Lint rules for Robot Framework data files.
#    Copyright © 2014 Richard Huang <rickypc@users.noreply.github.com>
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
from rflint.parser import KeywordTable, Row, TestcaseTable


def _get_count(rows, has_steps=False):
    """Returns total breaklines."""
    count = 0
    rows = list(rows)
    rows.reverse()
    for row in rows:
        if has_steps:
            count += _get_count(row.steps)
            if count > 0:
                break
        else:
            line = row.cells if isinstance(row, Row) else row
            if _is_breakline(line):
                count += 1
            else:
                break
    return count


def _get_rows(table):
    """Returns rows and step indicator."""
    response = {
        'has_steps': False,
        'rows': [],
    }
    if isinstance(table, KeywordTable):
        response['has_steps'] = True
        response['rows'] = table.keywords
    elif isinstance(table, TestcaseTable):
        response['has_steps'] = True
        response['rows'] = table.testcases
    else:
        response['rows'] = table.rows
    return response


def _get_total(rows, has_steps=False):
    """Returns total rows and steps if applicable."""
    total = len(rows)
    if has_steps:
        total += sum([len(row.statements) for row in rows])
    return total


def _is_breakline(statement):
    """Returns True if statement is a breakline, False otherwise."""
    return len(statement) == 1 and statement[0].strip() == ''


class TooFewTableBlankLines(GeneralRule):
    """Warn about tables without blank lines between each other.
    """
    max_allowed = 1
    message = 'Too few trailing blank lines in "%s" table.'
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        for table in robot_file.tables[:-1]:
            response = _get_rows(table)
            count = _get_count(**response)
            total = _get_total(**response)
            if count < self.max_allowed:
                linenumber = table.linenumber + total
                self.report(robot_file, self.message % table.name,
                            linenumber + self.max_allowed, 0)

    def configure(self, max_allowed):
        """Configures the rule."""
        self.max_allowed = int(max_allowed)


class TooManyTableBlankLines(GeneralRule):
    """Warn about tables with extra blank lines between each other.
    """
    max_allowed = 1
    message = 'Too many trailing blank lines in "%s" table.'
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        for table in robot_file.tables[:-1]:
            response = _get_rows(table)
            count = _get_count(**response)
            total = _get_total(**response)
            if count > self.max_allowed:
                linenumber = (table.linenumber + total) - count
                self.report(robot_file, self.message % table.name,
                            linenumber + self.max_allowed, 0)

    def configure(self, max_allowed):
        """Configures the rule."""
        self.max_allowed = int(max_allowed)
