import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface MakerAppSyncResolversConstructProps {
  api: appsync.IGraphqlApi;
  getMakerProfileLambda?: lambda.IFunction;
  setupMakerProfileLambda?: lambda.IFunction;
  updateMakerProfileLambda?: lambda.IFunction;
  updateSkillsLambda?: lambda.IFunction;
  getVerificationStatusLambda?: lambda.IFunction;
  getMakerSettingsLambda?: lambda.IFunction;
  updateMakerSettingsLambda?: lambda.IFunction;
  // Commission
  submitProposalLambda?: lambda.IFunction;
  listProposalsMakerLambda?: lambda.IFunction;
  listProposalsCollectorLambda?: lambda.IFunction;
  getProposalLambda?: lambda.IFunction;
  updateProposalStatusLambda?: lambda.IFunction;
  addMilestoneClipLambda?: lambda.IFunction;
}

export class MakerAppSyncResolversConstruct extends Construct {
  constructor(scope: Construct, id: string, props: MakerAppSyncResolversConstructProps) {
    super(scope, id);

    // Query Resolvers
    if (props.getMakerProfileLambda) {
      const getMakerProfileDataSource = props.api.addLambdaDataSource(
        'GetMakerProfileDataSource',
        props.getMakerProfileLambda
      );

      getMakerProfileDataSource.createResolver('GetMakerProfileResolver', {
        typeName: 'Query',
        fieldName: 'getMakerProfile',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });

      // Public profile resolver (now user pool auth)
      getMakerProfileDataSource.createResolver('GetPublicMakerProfileResolver', {
        typeName: 'Query',
        fieldName: 'getPublicMakerProfile',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getVerificationStatusLambda) {
      const getVerificationStatusDataSource = props.api.addLambdaDataSource(
        'GetVerificationStatusDataSource',
        props.getVerificationStatusLambda
      );

      getVerificationStatusDataSource.createResolver('GetVerificationStatusResolver', {
        typeName: 'Query',
        fieldName: 'getVerificationStatus',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getMakerSettingsLambda) {
      const getMakerSettingsDataSource = props.api.addLambdaDataSource(
        'GetMakerSettingsDataSource',
        props.getMakerSettingsLambda
      );

      getMakerSettingsDataSource.createResolver('GetMakerSettingsResolver', {
        typeName: 'Query',
        fieldName: 'getMakerSettings',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Mutation Resolvers
    if (props.setupMakerProfileLambda) {
      const setupMakerProfileDataSource = props.api.addLambdaDataSource(
        'SetupMakerProfileDataSource',
        props.setupMakerProfileLambda
      );

      setupMakerProfileDataSource.createResolver('SetupMakerProfileResolver', {
        typeName: 'Mutation',
        fieldName: 'setupMakerProfile',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.updateMakerProfileLambda) {
      const updateMakerProfileDataSource = props.api.addLambdaDataSource(
        'UpdateMakerProfileDataSource',
        props.updateMakerProfileLambda
      );

      updateMakerProfileDataSource.createResolver('UpdateMakerProfileResolver', {
        typeName: 'Mutation',
        fieldName: 'updateMakerProfile',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.updateSkillsLambda) {
      const updateSkillsDataSource = props.api.addLambdaDataSource(
        'UpdateSkillsDataSource',
        props.updateSkillsLambda
      );

      updateSkillsDataSource.createResolver('UpdateSkillsResolver', {
        typeName: 'Mutation',
        fieldName: 'updateSkills',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.updateMakerSettingsLambda) {
      const updateMakerSettingsDataSource = props.api.addLambdaDataSource(
        'UpdateMakerSettingsDataSource',
        props.updateMakerSettingsLambda
      );

      updateMakerSettingsDataSource.createResolver('UpdateMakerSettingsResolver', {
        typeName: 'Mutation',
        fieldName: 'updateMakerSettings',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // ── Commission Resolvers ────────────────────────────────────────
    if (props.submitProposalLambda) {
      const ds = props.api.addLambdaDataSource('SubmitProposalDataSource', props.submitProposalLambda);
      ds.createResolver('SubmitProposalResolver', {
        typeName: 'Mutation', fieldName: 'submitCommissionProposal',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.listProposalsMakerLambda) {
      const ds = props.api.addLambdaDataSource('ListProposalsMakerDataSource', props.listProposalsMakerLambda);
      ds.createResolver('ListProposalsMakerResolver', {
        typeName: 'Query', fieldName: 'listProposalsForMaker',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.listProposalsCollectorLambda) {
      const ds = props.api.addLambdaDataSource('ListProposalsCollectorDataSource', props.listProposalsCollectorLambda);
      ds.createResolver('ListProposalsCollectorResolver', {
        typeName: 'Query', fieldName: 'listProposalsForCollector',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getProposalLambda) {
      const ds = props.api.addLambdaDataSource('GetProposalDataSource', props.getProposalLambda);
      ds.createResolver('GetProposalResolver', {
        typeName: 'Query', fieldName: 'getProposal',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.updateProposalStatusLambda) {
      const ds = props.api.addLambdaDataSource('UpdateProposalStatusDataSource', props.updateProposalStatusLambda);
      ds.createResolver('UpdateProposalStatusResolver', {
        typeName: 'Mutation', fieldName: 'updateProposalStatus',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.addMilestoneClipLambda) {
      const ds = props.api.addLambdaDataSource('AddMilestoneClipDataSource', props.addMilestoneClipLambda);
      ds.createResolver('AddMilestoneClipResolver', {
        typeName: 'Mutation', fieldName: 'addMilestoneClip',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
      ds.createResolver('ListMilestoneClipsResolver', {
        typeName: 'Query', fieldName: 'listMilestoneClips',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }
  }
}
