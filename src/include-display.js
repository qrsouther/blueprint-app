/* eslint-disable no-unused-vars */
import {
  render,
  useState,
  useEffect,
  Fragment
} from '@forge/ui';
import { invoke } from '@forge/bridge';

const App = () => {
  const [excerpts, setExcerpts] = useState([]);
  const [, setSelectedExcerptId] = useState(null);
  const [selectedExcerpt, setSelectedExcerpt] = useState(null);
  const [variableValues, setVariableValues] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Load excerpts on mount
  useEffect(async () => {
    const result = await invoke('getExcerpts');

    if (result.success && result.data) {
      setExcerpts(result.data.excerpts);
    }
    setIsLoading(false);
  }, []);

  const onExcerptSelect = async (formData) => {
    const excerptId = formData.excerptSelect;

    if (!excerptId) {
      setSelectedExcerptId(null);
      setSelectedExcerpt(null);
      return;
    }

    setSelectedExcerptId(excerptId);

    // Load the full excerpt
    const result = await invoke('getExcerpt', { excerptId });

    if (result.success && result.data && result.data.excerpt) {
      setSelectedExcerpt(result.data.excerpt);
      // Initialize variable values
      const initialValues = {};
      if (result.data.excerpt.variables) {
        result.data.excerpt.variables.forEach(v => {
          initialValues[v.name] = '';
        });
      }
      setVariableValues(initialValues);
    }
  };

  const onVariableUpdate = (formData) => {
    setVariableValues(formData);
  };

  // Render content with variable substitution
  const renderContent = () => {
    if (!selectedExcerpt) {
      return null;
    }

    let content = selectedExcerpt.content;

    // Substitute variables
    if (selectedExcerpt.variables) {
      selectedExcerpt.variables.forEach(variable => {
        const value = variableValues[variable.name] || `{{${variable.name}}}`;
        const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
        content = content.replace(regex, value);
      });
    }

    return content;
  };

  const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  if (isLoading) {
    return (
      <Fragment>
        <Text>Loading excerpts...</Text>
      </Fragment>
    );
  }

  // Group excerpts by category
  const categorizedExcerpts = {};
  excerpts.forEach(excerpt => {
    const category = excerpt.category || 'General';
    if (!categorizedExcerpts[category]) {
      categorizedExcerpts[category] = [];
    }
    categorizedExcerpts[category].push(excerpt);
  });

  return (
    <Fragment>
      <Text>**Blueprint App Include**</Text>

      <Form onSubmit={onExcerptSelect} submitButtonText="Load Excerpt">
        <Select name="excerptSelect" label="Select Excerpt" isRequired>
          <Option label="-- Select an excerpt --" value="" />
          {Object.keys(categorizedExcerpts).sort().map(category => (
            <Fragment key={category}>
              {categorizedExcerpts[category].map(excerpt => (
                <Option
                  key={excerpt.id}
                  label={`[${category}] ${excerpt.name}`}
                  value={excerpt.id}
                />
              ))}
            </Fragment>
          ))}
        </Select>
      </Form>

      {selectedExcerpt && selectedExcerpt.variables && selectedExcerpt.variables.length > 0 && (
        <Fragment>
          <Text>---</Text>
          <Text>**Fill in Variables:**</Text>
          <Form onSubmit={onVariableUpdate} submitButtonText="Update Preview">
            {selectedExcerpt.variables.map(variable => (
              <TextField
                key={variable.name}
                name={variable.name}
                label={variable.name}
                placeholder={`Enter value for ${variable.name}`}
                defaultValue={variableValues[variable.name] || ''}
              />
            ))}
          </Form>
        </Fragment>
      )}

      {selectedExcerpt && (
        <Fragment>
          <Text>---</Text>
          <Text>**Rendered Content:**</Text>
          <Text>{renderContent()}</Text>
        </Fragment>
      )}
    </Fragment>
  );
};

export const handler = render(<App />);
