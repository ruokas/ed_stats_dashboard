import {
  initChartCopyButtons,
  initChartDownloadButtons,
  initTableDownloadButtons,
} from '../../events/charts.js';
import {
  setCopyButtonFeedback,
  storeCopyButtonBaseLabel,
  writeBlobToClipboard,
  writeTextToClipboard,
} from './clipboard.js';
import { createCopyExportFeature } from './features/copy-export.js';

export function setupCopyExportControls({
  selectors,
  getDatasetValue,
  setDatasetValue,
  describeError,
  chartButtons = true,
  tableButtons = true,
}) {
  const copyExportFeature = createCopyExportFeature({
    getDatasetValue,
    setDatasetValue,
    setCopyButtonFeedback,
    writeBlobToClipboard,
    writeTextToClipboard,
    describeError,
  });

  if (chartButtons) {
    initChartCopyButtons({
      selectors,
      storeCopyButtonBaseLabel,
      handleChartCopyClick: copyExportFeature.handleChartCopyClick,
    });
    initChartDownloadButtons({
      selectors,
      storeCopyButtonBaseLabel,
      handleChartDownloadClick: copyExportFeature.handleChartDownloadClick,
    });
  }

  if (tableButtons) {
    initTableDownloadButtons({
      selectors,
      storeCopyButtonBaseLabel,
      handleTableDownloadClick: copyExportFeature.handleTableDownloadClick,
    });
  }

  return copyExportFeature;
}
