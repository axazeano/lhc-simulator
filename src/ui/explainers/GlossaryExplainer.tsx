import { useI18n } from '../../i18n/I18nProvider';

/** Terms in the order they appear in the game; texts live in the locale files. */
export const GLOSSARY: { id: string; href: string }[] = [
  { id: 'synchrotron', href: 'https://en.wikipedia.org/wiki/Synchrotron' },
  { id: 'injection', href: 'https://home.cern/science/accelerators/accelerator-complex' },
  { id: 'ramp', href: 'https://home.cern/science/accelerators/large-hadron-collider' },
  { id: 'dipole', href: 'https://home.cern/science/engineering/pulling-together-superconducting-electromagnets' },
  { id: 'quadrupole', href: 'https://en.wikipedia.org/wiki/Quadrupole_magnet' },
  { id: 'rigidity', href: 'https://en.wikipedia.org/wiki/Rigidity_(electromagnetism)' },
  { id: 'dispersion', href: 'https://en.wikipedia.org/wiki/Dispersion_(accelerator_physics)' },
  { id: 'aperture', href: 'https://cds.cern.ch/record/782076' },
  { id: 'bunch', href: 'https://home.cern/science/accelerators/large-hadron-collider' },
  { id: 'emittance', href: 'https://en.wikipedia.org/wiki/Beam_emittance' },
  { id: 'betastar', href: 'https://en.wikipedia.org/wiki/Beta_function_(accelerator_physics)' },
  { id: 'luminosity', href: 'https://home.cern/science/accelerators/luminosity' },
  { id: 'integrated', href: 'https://en.wikipedia.org/wiki/Luminosity_(scattering_theory)' },
  { id: 'sqrts', href: 'https://en.wikipedia.org/wiki/Mandelstam_variables' },
  { id: 'crosssection', href: 'https://en.wikipedia.org/wiki/Cross_section_(physics)' },
  { id: 'barn', href: 'https://en.wikipedia.org/wiki/Barn_(unit)' },
  { id: 'eta', href: 'https://en.wikipedia.org/wiki/Pseudorapidity' },
  { id: 'pt', href: 'https://en.wikipedia.org/wiki/Transverse_momentum' },
  { id: 'invariantmass', href: 'https://en.wikipedia.org/wiki/Invariant_mass' },
  { id: 'resonance', href: 'https://en.wikipedia.org/wiki/Resonance_(particle_physics)' },
  { id: 'width', href: 'https://en.wikipedia.org/wiki/Relativistic_Breit%E2%80%93Wigner_distribution' },
  { id: 'resolution', href: 'https://en.wikipedia.org/wiki/Compact_Muon_Solenoid' },
  { id: 'branching', href: 'https://en.wikipedia.org/wiki/Branching_fraction' },
  { id: 'channel', href: 'https://en.wikipedia.org/wiki/Higgs_boson#Decay' },
  { id: 'background', href: 'https://en.wikipedia.org/wiki/Drell%E2%80%93Yan_process' },
  { id: 'sidebands', href: 'https://en.wikipedia.org/wiki/Statistical_significance' },
  { id: 'significance', href: 'https://en.wikipedia.org/wiki/Standard_deviation' },
  { id: 'fivesigma', href: 'https://home.cern/resources/faqs/five-sigma' },
];

export function GlossaryExplainer() {
  const { t } = useI18n();
  return (
    <div className="explainer-content">
      <p className="explainer-lede">{t('explainer.glossary.lede')}</p>
      <dl className="glossary">
        {GLOSSARY.map((entry) => (
          <div key={entry.id} className="glossary-entry" id={`term-${entry.id}`}>
            <dt>{t(`glossary.${entry.id}.term`)}</dt>
            <dd>
              {t(`glossary.${entry.id}.text`)}{' '}
              <a href={entry.href} target="_blank" rel="noreferrer">
                {t('hint.more')} ↗
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
