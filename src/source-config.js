/* eslint-disable no-unused-vars */
import {
  render,
  useConfig,
  useState
} from '@forge/ui';
import { invoke } from '@forge/bridge';

const App = () => {
  const config = useConfig() || {};
  const [formState] = useState({
    excerptName: config.excerptName || '',
    category: config.category || 'General',
    content: config.content || '',
    excerptId: config.excerptId || null
  });

  const onSubmit = async (formData) => {
    const result = await invoke('saveExcerpt', {
      excerptName: formData.excerptName,
      category: formData.category,
      content: formData.content,
      excerptId: formState.excerptId
    });

    // Return the config to save to the macro
    return result;
  };

  return (
    <Form onSubmit={onSubmit} submitButtonText="Save Blueprint App">
      <TextField
        name="excerptName"
        label="Excerpt Name"
        isRequired
        defaultValue={formState.excerptName}
      />

      <Select
        name="category"
        label="Category"
        defaultValue={formState.category}
      >
        <Option label="General" value="General" />
        <Option label="Pricing" value="Pricing" />
        <Option label="Technical" value="Technical" />
        <Option label="Legal" value="Legal" />
        <Option label="Marketing" value="Marketing" />
      </Select>

      <TextArea
        name="content"
        label="Content"
        placeholder="Enter your excerpt content here. Use {{variableName}} for variables."
        isRequired
        defaultValue={formState.content}
      />

      {formState.excerptId && (
        <Fragment>
          <Text>Excerpt ID: `{formState.excerptId}`</Text>
        </Fragment>
      )}

      <Text>💡 Tip: Use {'{{'}variableName{'}}'} syntax to create variables that can be filled in when including this excerpt.</Text>
    </Form>
  );
};

export const handler = render(<App />);
