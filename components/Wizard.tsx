import React from 'react';
import { DiagramType, LayoutStyle } from '../types';
import { ArrowRight, Activity, Database, Network, FileText, Users } from 'lucide-react';

interface WizardProps {
  onSubmit: (type: DiagramType, desc: string, layout: LayoutStyle, data: string) => void;
  loading: boolean;
}

const Wizard: React.FC<WizardProps> = ({ onSubmit, loading }) => {
  const [step, setStep] = React.useState(1);
  const [selectedType, setSelectedType] = React.useState<DiagramType | null>(null);
  const [description, setDescription] = React.useState('');
  const [detailData, setDetailData] = React.useState('');
  const [selectedLayout, setSelectedLayout] = React.useState<LayoutStyle>(LayoutStyle.TREE);

  const handleNext = () => {
    if (step === 1 && selectedType) setStep(2);
    else if (step === 2 && description) setStep(3);
  };

  const handleSubmit = () => {
    if (selectedType) {
      onSubmit(selectedType, description, selectedLayout, detailData);
    }
  };

  const renderTypeCard = (type: DiagramType, icon: React.ReactNode, desc: string) => (
    <div
      onClick={() => setSelectedType(type)}
      className={`p-6 border-2 rounded-xl cursor-pointer transition-all duration-200 flex flex-col items-center gap-4 hover:shadow-lg ${
        selectedType === type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
      }`}
    >
      <div className={`p-3 rounded-full ${selectedType === type ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
        {icon}
      </div>
      <h3 className="font-semibold text-lg text-gray-800">{type}</h3>
      <p className="text-sm text-gray-500 text-center">{desc}</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Your Mindmap</h1>
        <p className="text-gray-600">Visualize your ideas with AI-powered generation</p>
      </div>

      {/* Progress Bar */}
      <div className="flex justify-between mb-8 relative">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10 -translate-y-1/2"></div>
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
              step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            {s}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600 animate-pulse">Generating your diagram with Gemini 2.5...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 min-h-[400px]">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800">What would you like to create?</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {renderTypeCard(DiagramType.MINDMAP, <Network size={24} />, "Brainstorm ideas efficiently")}
                {renderTypeCard(DiagramType.FLOWCHART, <Activity size={24} />, "Visualize processes & steps")}
                {renderTypeCard(DiagramType.ERD, <Database size={24} />, "Model database relationships")}
                {renderTypeCard(DiagramType.ORG_CHART, <Users size={24} />, "Structure teams & roles")}
              </div>
              <div className="flex justify-end mt-6">
                <button
                  disabled={!selectedType}
                  onClick={handleNext}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800">Describe your idea</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (Required)</label>
                <textarea
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-32"
                  placeholder="E.g., A marketing strategy for a new coffee shop launch..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Additional Details (Optional)</label>
                <textarea
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24"
                  placeholder="Paste any existing data or specific constraints..."
                  value={detailData}
                  onChange={(e) => setDetailData(e.target.value)}
                />
              </div>
              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(1)} className="text-gray-600 hover:text-gray-800 px-4">Back</button>
                <button
                  disabled={!description.trim()}
                  onClick={handleNext}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Next <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800">Select Layout Style</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.values(LayoutStyle).map((layout) => (
                  <div
                    key={layout}
                    onClick={() => setSelectedLayout(layout)}
                    className={`p-4 border rounded-lg cursor-pointer text-center transition-all ${
                      selectedLayout === layout ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'
                    }`}
                  >
                    {layout}
                  </div>
                ))}
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3 mt-4">
                <FileText className="text-blue-600 shrink-0 mt-1" size={20} />
                <div>
                  <h4 className="text-sm font-semibold text-blue-900">Summary</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Creating a <strong>{selectedType}</strong> about "{description.slice(0, 30)}..." using <strong>{selectedLayout}</strong> layout.
                  </p>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(2)} className="text-gray-600 hover:text-gray-800 px-4">Back</button>
                <button
                  onClick={handleSubmit}
                  className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 font-medium"
                >
                  Generate Diagram
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Wizard;