pipeline {
    agent any

    environment {
        DEPLOY_PATH = '/path/to/guai-enterprise' 
    }

    stages {
        stage('Restart Container') {
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'ssh-key', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
                    sh """
                        ssh -o StrictHostKeyChecking=no -i "\${SSH_KEY}" \${SSH_USER} '
                            cd \${DEPLOY_PATH}/GU.AI-Backend && git checkout main && git pull origin main
                            docker-compose build backend
                            docker-compose up -d backend
                            docker image prune -f
                        '
                    """
                }
            }
        }
    }
}
