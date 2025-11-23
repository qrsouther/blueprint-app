/* eslint-disable no-unused-vars */
import { render, Fragment, Text, useConfig } from '@forge/ui';

const App = () => {
  const config = useConfig();

  // If no configuration yet, show placeholder
  if (!config || !config.excerptName) {
    return (
      <Fragment>
        <Text>_Blueprint App not configured. Click Edit to set up this excerpt._</Text>
      </Fragment>
    );
  }

  // Show the excerpt info in read view
  return (
    <Fragment>
      <Text>**Blueprint App: {config.excerptName}**</Text>
      <Text>Category: {config.category || 'General'}</Text>
      <Text>ID: `{config.excerptId}`</Text>
      <Text>---</Text>
      <Text>{config.content}</Text>
      {config.variables && config.variables.length > 0 && (
        <Fragment>
          <Text>---</Text>
          <Text>_Variables: {config.variables.map(v => `{{${v.name}}}`).join(', ')}_</Text>
        </Fragment>
      )}
    </Fragment>
  );
};

export const handler = render(<App />);
