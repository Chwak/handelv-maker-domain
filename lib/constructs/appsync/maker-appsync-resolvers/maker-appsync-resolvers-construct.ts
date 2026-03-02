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
  }
}
