import React, { useState, useEffect, useRef } from 'react';
import { WebcamCapture } from './WebcamCapture';
import { ImagePreview } from './ImagePreview';
import { InstructionOverlay } from './InstructionOverlay';
import { ProgressLoader } from './ProgressLoader';
import { 
  Camera, 
  Shield, 
  User, 
  FileText, 
  Upload, 
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  HelpCircle
} from 'lucide-react';
import { useKYCProcess } from '../hooks/useKYCProcess';
import toast from 'react-hot-toast';

const steps = [
  { 
    id: 1, 
    name: 'Selfie', 
    description: 'Capture your selfie',
    icon: User,
    instructions: [
      'Face the camera directly',
      'Ensure good lighting',
      'Remove glasses and hats',
      'Keep a neutral expression'
    ]
  },
  { 
    id: 2, 
    name: 'Liveness', 
    description: 'Complete security check',
    icon: Shield,
    instructions: [
      'Follow on-screen prompts',
      'Blink when asked',
      'Turn head slowly',
      'Stay in frame throughout'
    ]
  },
  { 
    id: 3, 
    name: 'ID Front', 
    description: 'Capture ID front side',
    icon: FileText,
    instructions: [
      'Use government-issued ID',
      'Ensure all details are visible',
      'Avoid glare and shadows',
      'Keep ID within frame'
    ]
  },
  { 
    id: 4, 
    name: 'ID Back', 
    description: 'Capture ID back side',
    icon: FileText,
    instructions: [
      'Capture the back of your ID',
      'Check for security features',
      'Keep it well-lit',
      'Ensure no blur'
    ]
  },
  { 
    id: 5, 
    name: 'Review', 
    description: 'Submit for verification',
    icon: Upload,
    instructions: [
      'Review all captured images',
      'Submit for processing',
      'Verification takes 2-3 minutes',
      'You will be notified of results'
    ]
  }
];

export const KYCStepper: React.FC = () => {
  const userId = localStorage.getItem('userId') || `user_${Date.now()}`;
  const { 
    state, 
    uploadSelfie, 
    uploadID, 
    checkStatus, 
    goToStep 
  } = useKYCProcess(userId);
  
  const [showInstructions, setShowInstructions] = useState(false);
  const [livenessChallenge, setLivenessChallenge] = useState<string>('blink');
  const [challengeCompleted, setChallengeCompleted] = useState(false);
  const [challengeCount, setChallengeCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const challengeTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Set initial user ID if not exists
    if (!localStorage.getItem('userId')) {
      localStorage.setItem('userId', userId);
    }
  }, [userId]);

  // Auto-advance from liveness check after completion
  useEffect(() => {
    if (challengeCompleted && state.currentStep === 2) {
      const timer = setTimeout(() => {
        goToStep(3);
        setChallengeCompleted(false);
        setChallengeCount(0);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [challengeCompleted, state.currentStep, goToStep]);

  // Generate random liveness challenge
  const generateLivenessChallenge = () => {
    const challenges = ['blink', 'turn_head_left', 'turn_head_right', 'smile'];
    const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)];
    setLivenessChallenge(randomChallenge);
    setChallengeCompleted(false);
  };

  const handleSelfieCapture = async (image: string) => {
    try {
      await uploadSelfie(image);
      generateLivenessChallenge();
      toast.success('Selfie captured! Complete liveness check');
    } catch (error) {
      toast.error('Failed to capture selfie. Please try again.');
    }
  };

  const handleLivenessComplete = () => {
    if (challengeCount < 2) {
      setChallengeCount(prev => prev + 1);
      generateLivenessChallenge();
      toast.success(`Challenge ${challengeCount + 1}/3 completed!`);
    } else {
      setChallengeCompleted(true);
      toast.success('Liveness check completed!');
    }
  };

  const handleIDCapture = async (image: string, side: 'front' | 'back') => {
    try {
      await uploadID(image, side);
      toast.success(`${side === 'front' ? 'Front' : 'Back'} ID captured!`);
    } catch (error) {
      toast.error(`Failed to capture ID ${side}. Please try again.`);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const status = await checkStatus();
      
      if (status?.status === 'processing') {
        toast.success('KYC submitted! Verification in progress...');
      }
      
    } catch (error) {
      toast.error('Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStepNavigation = (direction: 'next' | 'prev') => {
    const newStep = direction === 'next' 
      ? Math.min(state.currentStep + 1, steps.length)
      : Math.max(state.currentStep - 1, 1);
    
    goToStep(newStep);
  };

  const renderStepContent = () => {
    switch (state.currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Take a Selfie</h2>
              <p className="text-gray-600">
                Position your face in the frame and ensure good lighting
              </p>
            </div>
            
            <WebcamCapture
              onCapture={handleSelfieCapture}
              type="selfie"
            />
            
            {state.capturedImages.selfie && (
              <div className="mt-6">
                <ImagePreview
                  image={state.capturedImages.selfie}
                  type="selfie"
                  validation={{ isValid: true, message: 'Face detected' }}
                />
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Liveness Check</h2>
              <p className="text-gray-600">
                Complete the security challenge to prove you're a real person
              </p>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-yellow-800">
                    Challenge {challengeCount + 1}/3: {
                      livenessChallenge === 'blink' ? 'Blink 3 times' :
                      livenessChallenge === 'turn_head_left' ? 'Turn head left' :
                      livenessChallenge === 'turn_head_right' ? 'Turn head right' :
                      'Smile for the camera'
                    }
                  </p>
                  <p className="text-sm text-yellow-600 mt-1">
                    Follow the instructions shown on screen
                  </p>
                </div>
                {challengeCompleted && (
                  <CheckCircle className="w-6 h-6 text-green-500" />
                )}
              </div>
            </div>
            
            <WebcamCapture
              onCapture={() => {}}
              type="selfie"
              challenge={livenessChallenge as any}
            />
            
            <button
              onClick={handleLivenessComplete}
              disabled={challengeCompleted}
              className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Shield className="w-5 h-5 mr-2" />
              {challengeCompleted ? 'Challenge Completed' : 'Complete Challenge'}
            </button>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">ID Document - Front</h2>
              <p className="text-gray-600">
                Capture the FRONT side of your government-issued ID
              </p>
            </div>
            
            <WebcamCapture
              onCapture={(img) => handleIDCapture(img, 'front')}
              type="id"
            />
            
            {state.capturedImages.id_front && (
              <div className="mt-6">
                <ImagePreview
                  image={state.capturedImages.id_front}
                  type="id_front"
                  validation={{ isValid: true, message: 'Document captured' }}
                />
              </div>
            )}
            
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Tip:</strong> Use a dark background and ensure all text is readable
              </p>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">ID Document - Back</h2>
              <p className="text-gray-600">
                Capture the BACK side of your ID document
              </p>
            </div>
            
            <WebcamCapture
              onCapture={(img) => handleIDCapture(img, 'back')}
              type="id"
            />
            
            <div className="grid grid-cols-2 gap-4 mt-6">
              {state.capturedImages.id_front && (
                <ImagePreview
                  image={state.capturedImages.id_front}
                  type="id_front"
                />
              )}
              {state.capturedImages.id_back && (
                <ImagePreview
                  image={state.capturedImages.id_back}
                  type="id_back"
                />
              )}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Review & Submit</h2>
              <p className="text-gray-600">
                Verify all information before submission
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-4">Captured Images</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(state.capturedImages).map(([key, image]) => (
                  <ImagePreview
                    key={key}
                    image={image}
                    type={key as any}
                    onRemove={() => {
                      const newImages = { ...state.capturedImages };
                      delete newImages[key];
                      // In production, you would also delete from state and possibly backend
                    }}
                  />
                ))}
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-6 h-6 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">Ready to submit</p>
                  <p className="text-sm text-green-600 mt-1">
                    All required images have been captured. Click submit to start verification.
                  </p>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || Object.keys(state.capturedImages).length < 3}
              className="w-full flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Submit for Verification
                </>
              )}
            </button>
            
            <div className="text-center text-sm text-gray-500">
              <p>Verification usually takes 2-3 minutes</p>
              <p className="mt-1">You will be redirected to your dashboard</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const currentStep = steps[state.currentStep - 1];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Progress Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Identity Verification</h1>
              <p className="text-gray-600 mt-2">
                Step {state.currentStep} of {steps.length}: {currentStep.description}
              </p>
            </div>
            
            <button
              onClick={() => setShowInstructions(true)}
              className="flex items-center space-x-2 text-primary-600 hover:text-primary-700"
            >
              <HelpCircle className="w-5 h-5" />
              <span className="font-medium">Help</span>
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className="mb-2">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-600 transition-all duration-300"
                style={{ width: `${(state.currentStep / steps.length) * 100}%` }}
              />
            </div>
          </div>
          
          {/* Step Indicators */}
          <div className="flex justify-between mt-4">
            {steps.map((step) => (
              <div 
                key={step.id} 
                className="flex flex-col items-center"
              >
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center transition-all
                  ${state.currentStep >= step.id 
                    ? 'bg-primary-600 text-white' 
                    : 'bg-gray-100 text-gray-400'
                  }
                  ${state.currentStep === step.id 
                    ? 'ring-4 ring-primary-100 transform scale-110' 
                    : ''
                  }
                `}>
                  <step.icon className="w-5 h-5" />
                </div>
                <span className={`
                  mt-2 text-xs font-medium
                  ${state.currentStep >= step.id 
                    ? 'text-primary-600' 
                    : 'text-gray-400'
                  }
                `}>
                  {step.name}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          {renderStepContent()}
          
          {/* Navigation Buttons */}
          {state.currentStep < steps.length && (
            <div className="flex justify-between mt-8 pt-6 border-t">
              <button
                onClick={() => handleStepNavigation('prev')}
                disabled={state.currentStep === 1}
                className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Previous
              </button>
              
              <button
                onClick={() => handleStepNavigation('next')}
                className="flex items-center px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Next Step
                <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          )}
        </div>
        
        {/* Status Footer */}
        {state.status && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-blue-800">Verification Status</p>
                <p className="text-sm text-blue-600 mt-1">
                  {state.status.status === 'processing' && 'Processing your verification...'}
                  {state.status.status === 'completed' && 'Verification completed!'}
                  {state.status.status === 'failed' && 'Verification failed. Please try again.'}
                </p>
              </div>
              {state.status.scores && (
                <div className="text-right">
                  <p className="text-sm text-blue-600">
                    Score: {(state.status.scores.match * 100).toFixed(0)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Instructions Modal */}
      <InstructionOverlay
        step={state.currentStep}
        isVisible={showInstructions}
        onClose={() => setShowInstructions(false)}
      />
      
      {/* Global Loader */}
      {state.isLoading && (
        <ProgressLoader 
          message="Processing your request..."
          subMessage="Please wait while we process your images"
        />
      )}
    </div>
  );
};