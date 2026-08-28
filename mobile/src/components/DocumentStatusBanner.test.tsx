import { fireEvent, render, screen } from '@testing-library/react-native';
import DocumentStatusBanner from './DocumentStatusBanner';

const props = {
  documentLabel: 'Timeline',
  reloadNoun: 'timeline',
  conflictNoun: 'sequence',
  onReload: jest.fn(),
};

describe('DocumentStatusBanner', () => {
  beforeEach(() => {
    props.onReload.mockReset();
  });

  it('renders nothing while the document is idle', () => {
    const { toJSON } = render(
      <DocumentStatusBanner {...props} status="idle" error={null} />
    );
    expect(toJSON()).toBeNull();
  });

  it('offers a reload when someone else saved the document', () => {
    render(<DocumentStatusBanner {...props} status="conflict" error={null} />);

    expect(screen.getByLabelText('Timeline changed elsewhere')).toBeTruthy();
    expect(
      screen.getByText(/Someone else saved this sequence\./)
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Reload timeline'));
    expect(props.onReload).toHaveBeenCalled();
  });

  it('shows the failure message once the document is loaded', () => {
    render(
      <DocumentStatusBanner {...props} status="error" error="Network down" />
    );
    expect(screen.getByText('Network down')).toBeTruthy();
  });

  it('shows no failure banner when the status is error but no message came back', () => {
    const { toJSON } = render(
      <DocumentStatusBanner {...props} status="error" error={null} />
    );
    expect(toJSON()).toBeNull();
  });
});
