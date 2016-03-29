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

from rflint.common import KeywordRule, WARNING


def _get_count(steps):
    """Returns total breaklines."""
    count = 0
    steps = list(steps)
    steps.reverse()
    for step in steps:
        if _is_breakline(step):
            count += 1
        else:
            break
    return count


def _get_total(test):
    """Returns total steps."""
    return len(test.statements)


def _is_breakline(statement):
    """Returns True if statement is a breakline, False otherwise."""
    return len(statement) == 1 and statement[0].strip() == ''


def _last_keyword(keyword):
    """Returns True if given keyword is the last one."""
    parent_keywords = tuple(keyword.parent.keywords)
    return parent_keywords.index(keyword) == (len(parent_keywords) - 1)


class TooFewKeywordBlankLines(KeywordRule):
    """Warn about keyword without blank lines between each other.
    """
    max_allowed = 1
    severity = WARNING

    def apply(self, keyword):
        """Apply the rule to given keyword."""
        if not _last_keyword(keyword):
            count = _get_count(keyword.steps)
            total = _get_total(keyword)
            if count < self.max_allowed:
                linenumber = keyword.linenumber + total
                message = 'Too few trailing blank lines in "%s" keyword.' % \
                    keyword.name
                self.report(keyword, message, linenumber + self.max_allowed, 0)

    def configure(self, max_allowed):
        """Configures the rule."""
        self.max_allowed = int(max_allowed)


class TooManyKeywordBlankLines(KeywordRule):
    """Warn about keyword with extra blank lines between each other.
    """
    max_allowed = 1
    severity = WARNING

    def apply(self, keyword):
        """Apply the rule to given keyword."""
        if not _last_keyword(keyword):
            count = _get_count(keyword.steps)
            total = _get_total(keyword)
            if count > self.max_allowed:
                linenumber = (keyword.linenumber + total) - count
                message = 'Too many trailing blank lines in "%s" keyword.' % \
                    keyword.name
                self.report(keyword, message, linenumber + self.max_allowed, 0)

    def configure(self, max_allowed):
        """Configures the rule."""
        self.max_allowed = int(max_allowed)
