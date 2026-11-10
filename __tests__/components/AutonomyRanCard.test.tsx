import React from 'react';
import { render } from '@testing-library/react-native';

import AutonomyRanCard from '../../src/components/inbox/AutonomyRanCard';
import type { RanCardData } from '../../src/types/autonomyCards';
import { PaperWrapper as wrapper } from '../testUtils';

const makeCard = (overrides: Partial<RanCardData> = {}): RanCardData => ({
  state: 'done',
  answer: null,
  source: { kind: 'errand', label: 'Errand' },
  steps: [
    { label: 'Search the web', command: 'quick_search', status: 'ok', result: '5 results' },
  ],
  rules: [
    {
      tool: 'quick_search',
      effect: 'allow',
      scope: 'tool',
      note: '',
      reason: 'the tool declares run_without_confirmation',
      rule_id: null,
    },
  ],
  ...overrides,
});

describe('AutonomyRanCard', () => {
  it.each([
    ['running', 'Running…'],
    ['waiting', 'Waiting for your OK'],
    ['done', 'Done'],
    ['partial', 'Finished with issues'],
    ['failed', "Couldn't finish"],
    ['stopped', 'Stopped'],
  ])('shows the chip for state %s', (state, label) => {
    const { getByText } = render(<AutonomyRanCard data={makeCard({ state })} />, { wrapper });
    expect(getByText(label)).toBeTruthy();
  });

  it('shows no chip for an unknown state', () => {
    const { queryByTestId, getByTestId } = render(
      <AutonomyRanCard data={makeCard({ state: 'mystery' })} />,
      { wrapper },
    );
    expect(getByTestId('ran-card')).toBeTruthy();
    expect(queryByTestId('ran-state')).toBeNull();
  });

  it("shows a step's label and result", () => {
    const { getByTestId, getByText } = render(<AutonomyRanCard data={makeCard()} />, { wrapper });
    expect(getByTestId('ran-step-0')).toBeTruthy();
    expect(getByText('Search the web')).toBeTruthy();
    expect(getByText('5 results')).toBeTruthy();
  });

  it('shows a household rule with its note', () => {
    const { getByTestId, getByText } = render(
      <AutonomyRanCard
        data={makeCard({
          rules: [
            {
              tool: 'quick_search',
              effect: 'allow',
              scope: 'household',
              note: 'searching is fine',
              reason: 'household rule 3',
              rule_id: 3,
            },
          ],
        })}
      />,
      { wrapper },
    );
    expect(getByTestId('ran-rule-0')).toBeTruthy();
    expect(getByText('Why it was allowed')).toBeTruthy();
    expect(getByText('Household rule')).toBeTruthy();
    expect(getByText('quick_search')).toBeTruthy();
    expect(getByText('“searching is fine”')).toBeTruthy();
  });

  it('labels a tool-declared rule', () => {
    const { getByText } = render(<AutonomyRanCard data={makeCard()} />, { wrapper });
    expect(getByText("The tool says it's safe to run without asking")).toBeTruthy();
  });

  it('shows an errand source', () => {
    const { getByText } = render(<AutonomyRanCard data={makeCard()} />, { wrapper });
    expect(getByText('From: Errand')).toBeTruthy();
  });

  it("shows an automation source with its label", () => {
    const { getByText } = render(
      <AutonomyRanCard data={makeCard({ source: { kind: 'automation', label: 'I leave home' } })} />,
      { wrapper },
    );
    expect(getByText('From: Automation · I leave home')).toBeTruthy();
  });

  describe('answer', () => {
    const answer = 'The best is the **Breville Bambino Plus**.\n\n- Gaggia Classic Pro';

    it('shows the answer above the first step', () => {
      const { getByTestId, toJSON } = render(<AutonomyRanCard data={makeCard({ answer })} />, {
        wrapper,
      });
      expect(getByTestId('ran-answer')).toBeTruthy();
      const tree = JSON.stringify(toJSON());
      expect(tree.indexOf('"ran-answer"')).toBeGreaterThan(-1);
      expect(tree.indexOf('"ran-answer"')).toBeLessThan(tree.indexOf('"ran-step-0"'));
    });

    it('renders the answer as markdown', () => {
      const { getByText, queryByText } = render(
        <AutonomyRanCard data={makeCard({ answer })} />,
        { wrapper },
      );
      expect(getByText('Breville Bambino Plus')).toBeTruthy();
      expect(getByText('Gaggia Classic Pro')).toBeTruthy();
      expect(queryByText(/\*\*/)).toBeNull();
    });

    it('makes the answer text selectable', () => {
      const { getByText } = render(<AutonomyRanCard data={makeCard({ answer })} />, { wrapper });
      let node: any = getByText('Breville Bambino Plus');
      while (node && node.props.selectable === undefined) node = node.parent;
      expect(node?.props.selectable).toBe(true);
    });

    it('shows nothing extra without an answer (older cards)', () => {
      const { queryByTestId, getByTestId } = render(<AutonomyRanCard data={makeCard()} />, {
        wrapper,
      });
      expect(queryByTestId('ran-answer')).toBeNull();
      expect(getByTestId('ran-step-0')).toBeTruthy();
    });
  });
});
