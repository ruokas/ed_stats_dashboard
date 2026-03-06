const DEFAULT_SUMMARIES_SECTIONS_EXPANDED = {
  recent: true,
  yearly: true,
  reports: true,
};

const DEFAULT_SUMMARIES_REPORT_GROUPS_EXPANDED = {
  clinical: true,
  referral: true,
  pspc: true,
};

const SUMMARIES_SECTION_KEYS = Object.keys(DEFAULT_SUMMARIES_SECTIONS_EXPANDED);
const SUMMARIES_REPORT_GROUP_KEYS = Object.keys(DEFAULT_SUMMARIES_REPORT_GROUPS_EXPANDED);

function ensureSummariesDisclosureState(dashboardState) {
  dashboardState.summariesSectionsExpanded = {
    ...DEFAULT_SUMMARIES_SECTIONS_EXPANDED,
    ...(dashboardState?.summariesSectionsExpanded &&
    typeof dashboardState.summariesSectionsExpanded === 'object'
      ? dashboardState.summariesSectionsExpanded
      : {}),
  };
  dashboardState.summariesReportGroupsExpanded = {
    ...DEFAULT_SUMMARIES_REPORT_GROUPS_EXPANDED,
    ...(dashboardState?.summariesReportGroupsExpanded &&
    typeof dashboardState.summariesReportGroupsExpanded === 'object'
      ? dashboardState.summariesReportGroupsExpanded
      : {}),
  };
}

function updateToggle(button, expanded) {
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  button.classList.toggle('is-expanded', expanded);
}

export function createSummariesSectionCollapseFeature({ selectors, dashboardState }) {
  const setSummariesSectionExpanded = (key, expanded) => {
    if (!SUMMARIES_SECTION_KEYS.includes(String(key || ''))) {
      return;
    }
    ensureSummariesDisclosureState(dashboardState);
    dashboardState.summariesSectionsExpanded = {
      ...dashboardState.summariesSectionsExpanded,
      [key]: expanded === true,
    };
  };

  const setSummariesReportGroupExpanded = (key, expanded) => {
    if (!SUMMARIES_REPORT_GROUP_KEYS.includes(String(key || ''))) {
      return;
    }
    ensureSummariesDisclosureState(dashboardState);
    dashboardState.summariesReportGroupsExpanded = {
      ...dashboardState.summariesReportGroupsExpanded,
      [key]: expanded === true,
    };
  };

  const applySummariesDisclosure = () => {
    ensureSummariesDisclosureState(dashboardState);
    const sectionsExpanded = dashboardState.summariesSectionsExpanded || DEFAULT_SUMMARIES_SECTIONS_EXPANDED;
    const groupsExpanded =
      dashboardState.summariesReportGroupsExpanded || DEFAULT_SUMMARIES_REPORT_GROUPS_EXPANDED;

    (Array.isArray(selectors?.summariesSectionPanels) ? selectors.summariesSectionPanels : []).forEach(
      (panel) => {
        if (!(panel instanceof HTMLElement)) {
          return;
        }
        const key = String(panel.getAttribute('data-summaries-section-panel') || '').trim();
        if (!SUMMARIES_SECTION_KEYS.includes(key)) {
          return;
        }
        const expanded = sectionsExpanded[key] === true;
        panel.hidden = !expanded;
        panel.dataset.expanded = expanded ? 'true' : 'false';
      }
    );

    (Array.isArray(selectors?.summariesSectionToggleButtons)
      ? selectors.summariesSectionToggleButtons
      : []
    ).forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const key = String(button.getAttribute('data-summaries-section-toggle') || '').trim();
      if (!SUMMARIES_SECTION_KEYS.includes(key)) {
        return;
      }
      updateToggle(button, sectionsExpanded[key] === true);
    });

    (Array.isArray(selectors?.summariesReportGroupPanels)
      ? selectors.summariesReportGroupPanels
      : []
    ).forEach((panel) => {
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      const key = String(panel.getAttribute('data-summaries-report-group-panel') || '').trim();
      if (!SUMMARIES_REPORT_GROUP_KEYS.includes(key)) {
        return;
      }
      const expanded = groupsExpanded[key] === true;
      panel.hidden = !expanded;
      panel.dataset.expanded = expanded ? 'true' : 'false';
    });

    (Array.isArray(selectors?.summariesReportGroupToggleButtons)
      ? selectors.summariesReportGroupToggleButtons
      : []
    ).forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const key = String(button.getAttribute('data-summaries-report-group-toggle') || '').trim();
      if (!SUMMARIES_REPORT_GROUP_KEYS.includes(key)) {
        return;
      }
      updateToggle(button, groupsExpanded[key] === true);
    });
  };

  const bindSummariesDisclosureButtons = () => {
    selectors.summariesSectionToggleButtons?.forEach((button) => {
      button.addEventListener('click', (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const key = String(target.getAttribute('data-summaries-section-toggle') || '').trim();
        if (!SUMMARIES_SECTION_KEYS.includes(key)) {
          return;
        }
        const current = dashboardState.summariesSectionsExpanded?.[key] === true;
        setSummariesSectionExpanded(key, !current);
        applySummariesDisclosure();
      });
    });

    selectors.summariesReportGroupToggleButtons?.forEach((button) => {
      button.addEventListener('click', (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const key = String(target.getAttribute('data-summaries-report-group-toggle') || '').trim();
        if (!SUMMARIES_REPORT_GROUP_KEYS.includes(key)) {
          return;
        }
        const current = dashboardState.summariesReportGroupsExpanded?.[key] === true;
        setSummariesReportGroupExpanded(key, !current);
        applySummariesDisclosure();
      });
    });
  };

  const expandSummariesForTarget = (target) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const targetId = String(target.id || '').trim();
    if (targetId === 'recentHeading' || target.closest?.('[data-summaries-section-panel="recent"]')) {
      setSummariesSectionExpanded('recent', true);
    }
    if (targetId === 'yearlyHeading' || target.closest?.('[data-summaries-section-panel="yearly"]')) {
      setSummariesSectionExpanded('yearly', true);
    }
    const reportGroupPanel = target.closest?.('[data-summaries-report-group-panel]');
    if (
      targetId === 'summariesReportsHeading' ||
      target.closest?.('[data-summaries-section-panel="reports"]') ||
      reportGroupPanel
    ) {
      setSummariesSectionExpanded('reports', true);
    }
    const reportGroupKey = reportGroupPanel?.getAttribute('data-summaries-report-group-panel');
    if (SUMMARIES_REPORT_GROUP_KEYS.includes(String(reportGroupKey || '').trim())) {
      setSummariesReportGroupExpanded(String(reportGroupKey).trim(), true);
    } else if (targetId === 'summariesGroupClinicalHeading') {
      setSummariesReportGroupExpanded('clinical', true);
    } else if (targetId === 'summariesGroupReferralHeading') {
      setSummariesReportGroupExpanded('referral', true);
    } else if (targetId === 'summariesGroupPspcHeading') {
      setSummariesReportGroupExpanded('pspc', true);
    }
    applySummariesDisclosure();
  };

  return {
    applySummariesDisclosure,
    bindSummariesDisclosureButtons,
    expandSummariesForTarget,
  };
}
