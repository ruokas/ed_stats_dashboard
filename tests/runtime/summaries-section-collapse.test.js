import { describe, expect, it } from 'vitest';
import { createSummariesSectionCollapseFeature } from '../../src/app/runtime/runtimes/summaries/section-collapse.js';

function createSelectorsFromDom() {
  return {
    summariesSectionToggleButtons: Array.from(document.querySelectorAll('[data-summaries-section-toggle]')),
    summariesSectionPanels: Array.from(document.querySelectorAll('[data-summaries-section-panel]')),
    summariesReportGroupToggleButtons: Array.from(
      document.querySelectorAll('[data-summaries-report-group-toggle]')
    ),
    summariesReportGroupPanels: Array.from(document.querySelectorAll('[data-summaries-report-group-panel]')),
  };
}

describe('summaries section collapse', () => {
  it('syncs top-level and nested disclosure from dashboard state', () => {
    document.body.innerHTML = `
      <div data-summaries-section-toggle="recent" role="button" tabindex="0">
        <button type="button" id="recentAction">Action</button>
        <span class="summaries-section-toggle__icon"></span>
      </div>
      <div data-summaries-section-panel="recent"></div>
      <div data-summaries-section-toggle="reports" role="button" tabindex="0"></div>
      <div data-summaries-section-panel="reports"></div>
      <header data-summaries-report-group-toggle="clinical" role="button" tabindex="0">
        <button type="button" id="clinicalAction">Action</button>
        <span class="summaries-report-group-toggle__icon"></span>
      </header>
      <div data-summaries-report-group-panel="clinical"></div>
    `;
    const dashboardState = {
      summariesSectionsExpanded: { recent: false, reports: true },
      summariesReportGroupsExpanded: { clinical: false },
    };
    const feature = createSummariesSectionCollapseFeature({
      selectors: createSelectorsFromDom(),
      dashboardState,
    });

    feature.applySummariesDisclosure();

    expect(document.querySelector('[data-summaries-section-panel="recent"]').hidden).toBe(true);
    expect(
      document.querySelector('[data-summaries-section-toggle="recent"]').getAttribute('aria-expanded')
    ).toBe('false');
    expect(document.querySelector('[data-summaries-section-panel="reports"]').hidden).toBe(false);
    expect(document.querySelector('[data-summaries-report-group-panel="clinical"]').hidden).toBe(true);
    expect(
      document.querySelector('[data-summaries-report-group-toggle="clinical"]').getAttribute('aria-expanded')
    ).toBe('false');
  });

  it('toggles nested groups and expands jump-nav targets', () => {
    document.body.innerHTML = `
      <div data-summaries-section-toggle="reports" role="button" tabindex="0"></div>
      <div data-summaries-section-panel="reports">
        <section>
          <h3 id="summariesGroupReferralHeading">Referral</h3>
          <header data-summaries-report-group-toggle="referral" role="button" tabindex="0"></header>
          <div data-summaries-report-group-panel="referral">
            <canvas id="referralTrendChart"></canvas>
          </div>
        </section>
      </div>
    `;
    const dashboardState = {
      summariesSectionsExpanded: { reports: false },
      summariesReportGroupsExpanded: { referral: false },
    };
    const selectors = createSelectorsFromDom();
    const feature = createSummariesSectionCollapseFeature({ selectors, dashboardState });

    feature.applySummariesDisclosure();
    feature.bindSummariesDisclosureButtons();
    selectors.summariesReportGroupToggleButtons[0].click();

    expect(dashboardState.summariesReportGroupsExpanded.referral).toBe(true);
    expect(document.querySelector('[data-summaries-report-group-panel="referral"]').hidden).toBe(false);

    dashboardState.summariesSectionsExpanded.reports = false;
    dashboardState.summariesReportGroupsExpanded.referral = false;
    feature.expandSummariesForTarget(document.getElementById('referralTrendChart'));

    expect(dashboardState.summariesSectionsExpanded.reports).toBe(true);
    expect(dashboardState.summariesReportGroupsExpanded.referral).toBe(true);
    expect(document.querySelector('[data-summaries-section-panel="reports"]').hidden).toBe(false);
  });

  it('does not collapse when clicking nested interactive controls and supports keyboard toggle', () => {
    document.body.innerHTML = `
      <div data-summaries-section-toggle="recent" role="button" tabindex="0">
        <button type="button" id="recentAction">Action</button>
        <span class="summaries-section-toggle__icon"></span>
      </div>
      <div data-summaries-section-panel="recent"></div>
      <header data-summaries-report-group-toggle="clinical" role="button" tabindex="0">
        <select id="groupFilter"><option>One</option></select>
        <span class="summaries-report-group-toggle__icon"></span>
      </header>
      <div data-summaries-report-group-panel="clinical"></div>
    `;
    const dashboardState = {
      summariesSectionsExpanded: { recent: true },
      summariesReportGroupsExpanded: { clinical: true },
    };
    const selectors = createSelectorsFromDom();
    const feature = createSummariesSectionCollapseFeature({ selectors, dashboardState });

    feature.applySummariesDisclosure();
    feature.bindSummariesDisclosureButtons();
    document.getElementById('recentAction').click();
    document.getElementById('groupFilter').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dashboardState.summariesSectionsExpanded.recent).toBe(true);
    expect(dashboardState.summariesReportGroupsExpanded.clinical).toBe(true);

    selectors.summariesSectionToggleButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    selectors.summariesReportGroupToggleButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true })
    );

    expect(dashboardState.summariesSectionsExpanded.recent).toBe(false);
    expect(dashboardState.summariesReportGroupsExpanded.clinical).toBe(false);
  });
});
